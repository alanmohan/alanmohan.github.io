# CityLens — UK crime-pattern explorer

CityLens is a small browser application for travellers who want context about recent police-recorded incidents near a destination in England, Wales, or Northern Ireland. It geocodes a submitted city, neighbourhood, or postcode with the OpenStreetMap Nominatim search API, checks the latest reporting month, and then calls the official Police.uk street-crime endpoint for that month and the preceding eleven months. Broad city-boundary results are refined with a second “city centre” lookup so the one-mile crime search is centred on the place a visitor is most likely to mean; precise neighbourhood, street, and postcode searches retain their exact result. The API returns JSON objects containing a crime category, month, and deliberately approximate street location; the app combines and deduplicates the annual records into summary statistics, category bars, and higher-activity map points. Leaflet renders an OpenStreetMap base map and a responsive SVG activity overlay whose circle size and colour encode incident concentration.

## Run it

No API key, package installation, or build step is required. From the portfolio repository root, run:

```bash
python3 -m http.server 8113
```

Then open <http://127.0.0.1:8113/crime-safety-map/>. Enter a destination such as `London`, `Manchester`, `Cardiff`, or a postcode.
## API calls

- Geocoding: `https://nominatim.openstreetmap.org/search?q={place}&format=jsonv2&countrycodes=gb&limit=1`
- Latest reporting month: `https://data.police.uk/api/crime-last-updated`
- Crime data: `https://data.police.uk/api/crimes-street/all-crime?lat={latitude}&lng={longitude}&date={YYYY-MM}` (called for 12 months)

The police endpoint returns incidents within roughly one mile of the selected point. CityLens requests four months at a time until the latest complete 12-month window is loaded; if a month fails after one retry, the interface clearly identifies the missing month. When a broad city result needs a second geocoding lookup, the app waits more than one second to respect Nominatim's public-service rate limit. No secret credentials are used or stored.

## Important limitations

No free, keyless API was found that provides comparable street-level crime incidents for every city worldwide. This prototype therefore uses the reliable, keyless Police.uk API and clearly limits full coverage to England, Wales, and Northern Ireland. Scotland is excluded because the source only contains British Transport Police incidents there and would substantially understate crime.

The underlying police locations are anonymised to nearby map points. Recorded incidents are not a complete measure of safety: reporting rates vary, busy places naturally contain more people, and a historical cluster does not mean an area is unsafe now. The interface therefore describes “higher-activity locations” rather than declaring neighbourhoods dangerous.

## Testing performed

- Valid searches for multiple UK cities
- Empty input
- Unknown or misspelled location
- No-results response
- Network/API failure handling
- High-volume `503` response guidance
- Responsive layouts for desktop and mobile

## Sources

- [UK Police street-level crime API documentation](https://data.police.uk/docs/method/crime-street/)
- [Police.uk changelog and known data issues](https://data.police.uk/changelog/)
- [Nominatim search API documentation](https://nominatim.org/release-docs/latest/api/Search/)
- [Leaflet documentation](https://leafletjs.com/reference.html)

## AI attribution

OpenAI Codex (GPT-5.6 sol) was used to develop the web app.
