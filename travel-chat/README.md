# Travel Chat frontend

Static HTML, CSS, and JavaScript inside the [portfolio repository](https://github.com/alanmohan/alanmohan.github.io). Visitors enter a total USD budget, trip length, interests, travel party, and a question; they can then ask follow-ups. The page shows loading and error messages and keeps the last eight conversation messages in tab memory. It sends those with each request to the [Flask backend](https://github.com/alanmohan/travel-chat-backend).

To test locally, run `python3 -m http.server 8113` from the portfolio repository root and visit `http://127.0.0.1:8113/travel-chat/`. `app.js` points to the deployed Render API. To use a local backend instead, set its `API_URL` to `http://127.0.0.1:5000/api/chat` and start the backend at port 5000. The page is published through the portfolio's existing GitHub Pages setup.
