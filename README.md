# Research Desk

A static, private research toolkit for GitHub Pages: dashboard, planner (month/week, `.ics` export, reminders), semester timetable (teaching weeks × periods, seeded with the current courses), kanban tasks, milestones + document expiries, conference/journal tracker, study and research logs, literature tracker with matrix view and review outline, an A4 PDF activity-report generator, and mining calculators (backfill mix, rockburst screening, infrared emissivity).

- **Privacy:** no personal data in this repo. Everything is stored in your browser, encrypted with AES-GCM using a key derived from your login (PBKDF2); the repo holds only a salt and a check value, never the email or password. This protects data on the device, not the public source code. Use *Export all (JSON)* to back up or move to another device.
- **Sync:** optional Google Drive sync (Sync tab) uploads the encrypted vault into a Drive folder you pick (Google Picker), and lists, uploads, downloads and trashes the files in that folder. It uses the `drive.file` scope (the site sees only files it uploaded or that you selected in the picker) and your own OAuth Client ID; enable both the Drive API and the Picker API.
- **Offline:** after the first visit a service worker caches the app and the two CDN libraries (jsPDF 2.5.1, jspdf-autotable 3.8.2).
- **No build step:** vanilla HTML/CSS/ES modules. Open `index.html` through any static server, e.g. `python3 -m http.server`.
- **Test:** `node test/calc.test.mjs` checks the formulas, semester week and class-date logic, repeat-event expansion and the ICS generator.

Calculator results are screening aids only; verify them against your references.
