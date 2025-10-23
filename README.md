## Resources for research

https://github.com/HasData/zillow-api-python?tab=readme-ov-file

https://github.com/HasData/zillow-api

https://github.com/cermak-petr/actor-zillow-api-scraper

## Forums for Permiting

https://www.reddit.com/r/santacruz/comments/1jdj2oc/what_are_peoples_experiences_with_permits_in_the/

## Land Pain Points

- Landslide zone (requires $40-60k geologist to dig a hole and recommend a foundation)
- Fire zone (requires geologist again, and water hookups (26k/hookup))
- Septic ($80k)

## Zoning and Permits

https://cdi.santacruzcountyca.gov/UPC/BuildingPermitsSafety/BuildingPermitsIndex/FrequentlyAskedQuestionsAboutBuildingPermits/WhenisaBuildingPermitNOTRequired.aspx


## Global Temperature Globe (Google Earth Engine + Cesium)

This app serves a 3D globe with a live global temperature heatmap using NOAA GFS data via Google Earth Engine (GEE) and renders it with CesiumJS.

### Prerequisites
- Node.js 18+
- A Google Cloud project with Earth Engine API enabled: `california-weather-maps`
- Earth Engine access for your credentials (service account recommended)

### Setup
1. Copy environment template:
   ```bash
   cp env.example .env
   ```
   Optionally adjust `GCP_PROJECT_ID` (defaults to `california-weather-maps`).

2. Install dependencies:
   ```bash
   brew install node #(optional, you may have it already)
   npm install
   ```



### Authenticate (one-time, local machine)
- Use gcloud Application Default Credentials (ADC):
  ```bash
  gcloud auth application-default login --project $(grep ^GCP_PROJECT_ID .env | cut -d= -f2)
  ```

### Run
- Quick launch (installs if needed, starts server, opens browser):
  ```bash
  bash scripts/launch.sh
  ```

- Or manually:
  ```bash
  npm start
  # then open http://localhost:3000
  ```

### What it does
- Backend: Initializes Earth Engine using your credentials and exposes `/api/temperature-tiles` which returns an XYZ tile URL for the latest `NOAA/GFS0P25` temperature (converted to °C) with a heatmap palette.
- Frontend: Loads Cesium globe and overlays the returned tile URL as an imagery layer.

### Environment variables
- `PORT`: Web server port (default `3000`)
- `GOOGLE_EARTH_ENGINE_SERVICE_ACCOUNT`: Service account email
- `GOOGLE_EARTH_ENGINE_PRIVATE_KEY`: Private key from the JSON key (keep quotes, keep `\n` newlines)
- (Optional) `GOOGLE_EARTH_ENGINE_OAUTH_TOKEN`: OAuth access token if you prefer OAuth over a service account

### Notes
- The NOAA GFS dataset is forecast data and updates periodically. We fetch the most recent image available.
- If you see authentication errors, verify the API is enabled, the service account has Earth Engine access, and the key formatting preserves newlines (use `\n`).
- Zillow API - https://www.zillowgroup.com/developers/api/mls-broker-data/mls-listings/


