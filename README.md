# cf-th

## Solution
This is a small Nodejs app. The solution is contained in index.js. An accompanying UI, which was entirely generated with AI, reviewed and tweaked by myself, is included in `view/index.ejs`. The url to live solution is here on Render: [Link](https://solar-lead-pipeline.onrender.com/). Please note that because of the free version of Render, cold starts could take up to 30 seconds.

For the `index.js` file, I wrote the API endpoints, request code to the simulated lead endpoints and validation logic and generated the surrounding code with AI.

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
- I believe that given the customer attribute mapping json file, the customer will be very happy if the answers to the questions from the leads are cleanly mapped to those JSON files. I demonstrated a basic solution where the questions are mapped to the attributes and the answers are compared to the possible valid answers. Those that match are then added to the `lead_attributes` json. A great alternative would be to leverage AI to do this mapping for us.
