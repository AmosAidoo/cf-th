require("dotenv").config()

const express = require("express")
const axios = require("axios")
const app = express()

const port = process.env.PORT || 3000
const WEBHOOK_BASE_URL = process.env.WEBHOOK_URL || process.env.RENDER_EXTERNAL_URL || `http://localhost:${port}`

app.use(express.json())
app.use(express.urlencoded({ extended: true }))
app.set("view engine", "ejs")
app.set("views", "./views")

const USER_ID = "aidoo"
const API_BASE_URL = process.env.API_BASE_URL
const BEARER_TOKEN = process.env.BEARER_TOKEN
const ZIPCODE_PREFIX = "66"

let recentLeads = []
const MAX_RECENT_LEADS = 10

function isHouseOwner(lead) {
	const ownershipQuestion = lead.questions["Sind Sie Eigentümer der Immobilie?"]
	if (!ownershipQuestion) return false
	
	const normalized = ownershipQuestion.toLowerCase().trim()
	return normalized === "ja" || normalized === "true"
}

function splitStreetAndHouseNumber(street) {
	if (!street) return ["", ""]
	let hnPos = street.search(/\d/)
	return [
		hnPos > -1 ? street.substring(0, hnPos).trim() : street.trim(),
		hnPos > -1 ? street.substring(hnPos).trim() : ""
	]
}

// Mapping Code was generatied with AI
const MAPPING_SCHEMA = {
  // 1. Direct Question-to-Attribute Mappings
  "Welche Dachform haben Sie auf Ihrem Haus?": {
    target: "solar_roof_type",
    fallback: "Andere",
    options: ["Flachdach", "Satteldach", "Pultdach", "Walmdach", "Mansardendach", "Krüppelwalmdach"]
  },
  "Wie hoch schätzen Sie ihren Stromverbrauch?": {
    target: "solar_energy_consumption",
    type: "numeric",
    fallback: 3500 // Average household consumption
  },
  "Sind Sie Eigentümer der Immobilie?": {
    target: "solar_owner",
    fallback: "Ja",
    options: ["Ja", "Nein", "In Auftrag"]
  },
  "Wo möchten Sie die Solaranlage installieren?": {
    target: "solar_property_type",
    fallback: "Einfamilienhaus",
    options: ["Einfamilienhaus", "Zweifamilienhaus", "Mehrfamilienhaus", "Firmengebäude"]
  },
  "Wie alt ist Ihr Dach?": {
    target: "solar_roof_age",
    fallback: "Jünger als 30 Jahre",
    customLogic: (val) => val.includes("1990") ? "Älter als 30 Jahre" : "Jünger als 30 Jahre"
  },
  "Dachmaterial": {
    target: "solar_roof_material",
    fallback: "Dachziegel",
    options: ["Dachziegel", "Bitumen", "Schiefer", "Blech/Trapezblech"]
  },
  "Dachausrichtung": {
    target: "solar_south_location",
    fallback: "Nicht sicher",
    options: ["Süd", "West", "Ost", "Süd-West", "Süd-Ost"]
  },
  "Stromspeicher gewünscht": {
    target: "solar_power_storage",
    fallback: "Noch nicht sicher",
    options: { "ja": "Ja", "nein": "Nein", "nicht sicher": "Noch nicht sicher" }
  },
  "Dachfläche": {
    target: "solar_area",
    type: "numeric",
    fallback: 60
  }
}

const SYSTEM_DEFAULTS = {
  solar_offer_type: "Beides interessant", // Maximize conversion options
  solar_roof_condition: "Guter Zustand",   // standard lead assumption
  solar_usage: "Netzeinspeisung und Eigenverbrauch", // industry standard for PV
  solar_monthly_electricity_bill: 120 // Derived average if not provided
}

function mapLeadAttributes(sourceData) {
  const result = { ...SYSTEM_DEFAULTS }

  for (const [question, config] of Object.entries(MAPPING_SCHEMA)) {
    const rawValue = sourceData[question]
    
    // Numeric handling
    if (config.type === "numeric") {
      result[config.target] = parseInt(rawValue?.replace(/\D/g, '')) || config.fallback
      continue
    }

    // Logic-based mapping
    if (config.customLogic && rawValue) {
      result[config.target] = config.customLogic(rawValue)
      continue
    }

    // Enum matching
    if (rawValue) {
      const cleanInput = rawValue.toLowerCase()
      if (Array.isArray(config.options)) {
        const match = config.options.find(opt => cleanInput.includes(opt.toLowerCase()))
        result[config.target] = match || config.fallback
      } else {
        // Keyword object matching
        const match = Object.entries(config.options).find(([key]) => cleanInput.includes(key))
        result[config.target] = match ? match[1] : config.fallback
      }
    } else {
      result[config.target] = config.fallback
    }
  }

  return result
}

function normalizePhone(phone) {
	if (!phone) return ""
	return phone.replace(/\s+/g, "").trim()
}

function normalizeZipcode(zipcode) {
	if (!zipcode) return ""
	return zipcode.padStart(5, "0")
}

function validateTransformedLead(transformedLead) {
	const errors = []
	
	if (!transformedLead.lead.phone) {
		errors.push("Missing required field: phone")
	}
	if (!transformedLead.product.name) {
		errors.push("Missing required field: product.name")
	}
	
	if (errors.length > 0) {
		console.log(`[ERROR] Lead validation failed: ${errors.join(", ")}`)
		return false
	}
	
	return true
}

async function sendToCustomerAPI(transformedLead, retries = 3) {
	const url = `${API_BASE_URL}/receive/fake/${USER_ID}/`
	
	for (let attempt = 1; attempt <= retries; attempt++) {
		try {
			console.log(`[INFO] Sending lead to customer API (attempt ${attempt}/${retries})`)
			console.log(`[DEBUG] Payload:`, JSON.stringify(transformedLead, null, 2))
			
			const response = await axios.post(url, transformedLead, {
				headers: {
					Authorization: `Bearer ${BEARER_TOKEN}`,
					"Content-Type": "application/json"
				}
			})
			
			console.log(`[SUCCESS] Lead sent successfully. Response:`, response.data)
			return { success: true, data: response.data }
			
		} catch (error) {
			console.log(`[ERROR] Attempt ${attempt} failed:`, error.response?.data || error.message)
			
			if (error.response && error.response.status >= 400 && error.response.status < 500) {
				console.log(`[ERROR] Client error (${error.response.status}), not retrying`)
				return { 
					success: false, 
					error: error.response.data || error.message,
					status: error.response.status 
				}
			}
			
			if (attempt < retries) {
				const delay = Math.pow(2, attempt) * 1000
				console.log(`[INFO] Retrying in ${delay}ms...`)
				await new Promise(resolve => setTimeout(resolve, delay))
			}
		}
	}
	
	return { success: false, error: "Max retries exceeded" }
}

function addToRecentLeads(leadData) {
	recentLeads.unshift({
		...leadData,
		timestamp: new Date().toISOString()
	})
	
	if (recentLeads.length > MAX_RECENT_LEADS) {
		recentLeads = recentLeads.slice(0, MAX_RECENT_LEADS)
	}
}

// UI Routes
app.get("/", (req, res) => {
	res.render("index", { 
		recentLeads,
		config: {
			userId: USER_ID,
			zipcodePrefix: ZIPCODE_PREFIX,
			webhookUrl: `${WEBHOOK_BASE_URL}/webhook`
		}
	})
})

app.get("/trigger", async (req, res) => {
	try {
		console.log(`[INFO] UI: Triggering lead generation...`)
		
		const webhookUrl = `${WEBHOOK_BASE_URL}/webhook`
		
		await axios.post(
			`${API_BASE_URL}/trigger/fake/${USER_ID}/`,
			{
				url: webhookUrl
			},
			{
				headers: {
					Authorization: `Bearer ${BEARER_TOKEN}`
				}
			}
		)
		
		console.log(`[SUCCESS] UI: Lead trigger successful`)
		
		res.redirect("/?success=true")
		
	} catch (error) {
		console.log(`[ERROR] UI: Failed to trigger pipeline:`, error.response?.data || error.message)
		res.redirect("/?error=" + encodeURIComponent(error.message))
	}
})

app.post("/clear", (req, res) => {
	recentLeads = []
	console.log(`[INFO] UI: Cleared recent leads`)
	res.redirect("/")
})

app.get("/api/latest-lead", (req, res) => {
	if (recentLeads.length === 0) {
		return res.json({ status: "none" })
	}
	
	const latestLead = recentLeads[0]
	res.json({
		status: latestLead.status,
		reason: latestLead.reason,
		timestamp: latestLead.timestamp
	})
})

// Api Routes
app.post("/webhook", async (req, res) => {
	const newLead = req.body
	
	console.log(`[INFO] Received new lead:`, JSON.stringify(newLead, null, 2))
	
	const leadResult = {
		receivedAt: new Date().toISOString(),
		originalLead: newLead,
		status: null,
		reason: null,
		transformedLead: null,
		customerResponse: null,
		warnings: [],
		error: null
	}
	
	try {
		// Step 1: Filter by zipcode
		if (!newLead.zipcode || !newLead.zipcode.startsWith(ZIPCODE_PREFIX)) {
			console.log(`[FILTER] Lead rejected: zipcode "${newLead.zipcode}" does not start with ${ZIPCODE_PREFIX}`)
			leadResult.status = "filtered"
			leadResult.reason = `Zipcode must start with ${ZIPCODE_PREFIX}`
			addToRecentLeads(leadResult)
			
			return res.json({ 
				status: "filtered", 
				reason: `Zipcode must start with ${ZIPCODE_PREFIX}`,
				lead_id: newLead.created_at 
			})
		}
		
		// Step 2: Filter by ownership
		if (!isHouseOwner(newLead)) {
			console.log(`[FILTER] Lead rejected: not a house owner`)
			leadResult.status = "filtered"
			leadResult.reason = "Lead must be house owner"
			addToRecentLeads(leadResult)
			
			return res.json({ 
				status: "filtered", 
				reason: "Lead must be house owner",
				lead_id: newLead.created_at 
			})
		}
		
		console.log(`[PASS] Lead passed filters (zipcode: ${newLead.zipcode}, owner: yes)`)
		
		// Step 3: Transform lead
		const leadAttributes = mapLeadAttributes(newLead.questions || {})
		
		const [street, housenumber] = splitStreetAndHouseNumber(newLead.street)
		
		const transformedLead = {
			lead: {
				phone: normalizePhone(newLead.phone),
				email: newLead.email || "",
				first_name: newLead.first_name || "",
				last_name: newLead.last_name || "",
				street: street || "",
				housenumber: housenumber || "",
				postcode: normalizeZipcode(newLead.zipcode),
				city: newLead.city || "",
				country: "de"
			},
			product: {
				name: "Solaranlagen"
			},
			lead_attributes: leadAttributes,
			meta_attributes: {
				unique_id: newLead.created_at ? String(newLead.created_at) : "",
				landingpage_url: "",
				utm_campaign: "",
				utm_content: "",
				utm_medium: "",
				utm_placement: "",
				utm_source: "",
				utm_term: "",
				ip: "",
				browser: "",
				optin: false,
				optin_wording: "",
				optin_wording_2: ""
			}
		}
		
		leadResult.transformedLead = transformedLead
		
		// Step 4: Validate transformed lead
		if (!validateTransformedLead(transformedLead)) {
			console.log(`[ERROR] Transformed lead failed validation`)
			leadResult.status = "error"
			leadResult.reason = "Lead validation failed"
			addToRecentLeads(leadResult)
			
			return res.status(400).json({ 
				status: "error", 
				message: "Lead validation failed",
				lead_id: newLead.created_at 
			})
		}
		
		// Step 5: Send to customer API
		const result = await sendToCustomerAPI(transformedLead)
		
		if (result.success) {
			leadResult.status = "success"
			leadResult.customerResponse = result.data
			addToRecentLeads(leadResult)
			
			return res.json({ 
				status: "success", 
				message: "Lead sent to customer API",
				lead_id: newLead.created_at,
				customer_response: result.data,
			})
		} else {
			leadResult.status = "error"
			leadResult.reason = "Failed to send to customer API"
			leadResult.error = result.error
			addToRecentLeads(leadResult)
			
			return res.status(500).json({ 
				status: "error", 
				message: "Failed to send lead to customer API",
				error: result.error,
				lead_id: newLead.created_at 
			})
		}
		
	} catch (error) {
		console.log(`[ERROR] Unexpected error processing lead:`, error)
		leadResult.status = "error"
		leadResult.reason = "Internal server error"
		leadResult.error = error.message
		addToRecentLeads(leadResult)
		
		return res.status(500).json({ 
			status: "error", 
			message: "Internal server error",
			error: error.message 
		})
	}
})

app.listen(port, () => {
	console.log(`[INFO] Server listening on port ${port}`)
	console.log(`[INFO] Dashboard: http://localhost:${port}`)
	console.log(`[INFO] Webhook endpoint: ${WEBHOOK_BASE_URL}/webhook`)
	console.log(`[INFO] Test endpoint: http://localhost:${port}/pipeline`)
})