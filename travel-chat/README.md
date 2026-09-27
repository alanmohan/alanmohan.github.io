# Travel Chat frontend

Static HTML, CSS, and JavaScript inside the [portfolio repository](https://github.com/alanmohan/alanmohan.github.io). Visitors enter a total USD budget, trip length, interests, travel party, and a question; they can then ask follow-ups. The page shows loading and error messages and keeps the last eight conversation messages in tab memory. It sends those with each request to the [Flask backend](https://github.com/alanmohan/travel-chat-backend).

To test locally, run `python3 -m http.server 8113` from the portfolio repository root, start the backend at port 5000, and visit `http://127.0.0.1:8113/travel-chat/`. `app.js` contains the deployed API URL. The page is published through the portfolio's existing GitHub Pages setup.
