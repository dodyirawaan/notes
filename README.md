# Research Desk

A static, private research toolkit for GitHub Pages: dashboard, planner (month/week, `.ics` export, reminders), class timetable, kanban tasks, milestones + document expiries, conference/journal tracker, study and research logs, literature tracker with matrix view and review outline, an A4 PDF activity-report generator, and mining calculators (backfill mix, rockburst screening, infrared emissivity).

- **Privacy:** no personal data in this repo. Everything is stored in your browser (localStorage; photos in IndexedDB). Use *Export all (JSON)* to back up or move to another device.
- **Offline:** after the first visit a service worker caches the app and the two CDN libraries (jsPDF 2.5.1, jspdf-autotable 3.8.2).
- **No build step:** vanilla HTML/CSS/ES modules. Open `index.html` through any static server, e.g. `python3 -m http.server`.
- **Test:** `node test/calc.test.mjs` checks the formulas, repeat-event expansion and the ICS generator.

Calculator results are screening aids only; verify them against your references.
