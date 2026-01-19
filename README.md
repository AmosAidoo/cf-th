# cf-th

## Solution

![UI Screenshot](/screenshot.png)

This is a small Nodejs app. The solution is contained in index.js. An accompanying UI, which was entirely generated with AI, reviewed and tweaked by myself, is included in `view/index.ejs`. The url to live solution is here on Render: [Link](https://solar-lead-pipeline.onrender.com/). Please note that because of the free version of Render, cold starts could take up to 30 seconds.

For the `index.js` file, I wrote the API endpoints, request code to the simulated lead endpoints and validation logic and generated the surrounding code with AI.

## How to use the UI
Click on the button with text, "Generate Test Lead". If the lead passes the filters, it will be sent to the customer.
It can take a while to get such a lead so a second button with text "Auto-Generate Until Success" has been added which will simulate clicking the Generate button until the first sucessful lead that passes all filters but stops after 50 unsuccessful attempts. Kindly note that you will have to reload the page to see the list of recent leads. You won't have to do this when you click on "Generate Test Lead" though as the page reloads automatically.

## Running the solution locally
- Clone this repository.
- Run `npm install`.
- Set environment variables, more on this below.
- Run `npm start` to start the local server.

### Environment Variables
```
PORT=
WEBHOOK_URL=
BEARER_TOKEN=
API_BASE_URL=
```

## What would make the customer even more happy
- I believe that given the customer attribute mapping json file, the customer will be very happy if the answers to the questions from the leads are cleanly mapped to those JSON files. I demonstrated a basic solution where the questions are mapped to the attributes and the answers are compared to the possible valid answers based on substrings or complete matches. More of in the next section.
- 

## How the mapping from question to customer attribute mapping works
In a real system, a much more robust approach would be taken. The API requires enum values to be present so I chose some sensible default values. Here is the mapping used, fallbacks and default values:
```javascript
const MAPPING_SCHEMA = {
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
``` 
