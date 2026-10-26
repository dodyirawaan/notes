// Default clock times of each teaching period (1-based); editable in the Timetable tab.
// The real course timetable is NOT kept here: this repo is public. It is imported once as JSON in the
// Timetable tab and stored only in the encrypted vault (key 'timetable.seed'), see timetable.js.
export const PERIODS = [
  '08:00-08:45', '08:50-09:35', '10:05-10:50', '10:55-11:40',
  '14:00-14:45', '14:50-15:35', '16:05-16:50', '16:55-17:40',
  '19:00-19:45', '19:50-20:35', '20:40-21:25', '21:30-22:15',
];
