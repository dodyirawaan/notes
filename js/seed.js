// Real semester timetable, loaded on first run (no timetable stored yet) and by "Reset to seed".
export const SEED = {
  "semesterStart": "2026-09-07",
  "courses": [
    {"code":"020009YS","name":"《矿业工程》学科专题讲座","teacher":"张强","credits":3,"weeks":"11-16",
     "slots":[{"day":"Tue","from":5,"to":8},{"day":"Thu","from":5,"to":8}],"room":"Online"},
    {"code":"020012YS","name":"矿业生态环境学","teacher":"种照辉","credits":3,"weeks":"11-16",
     "slots":[{"day":"Mon","from":5,"to":8},{"day":"Thu","from":1,"to":4}],"room":"Online"},
    {"code":"330005YS","name":"综合汉语-全英（硕博贯通）","teacher":"","credits":4,"weeks":"2-17",
     "slots":[{"day":"Mon","from":1,"to":2},{"day":"Thu","from":9,"to":10}],"room":"邵204"}
  ]
};

// Clock times of each teaching period (1-based); editable in the Timetable tab.
export const PERIODS = [
  '08:00-08:45', '08:50-09:35', '10:05-10:50', '10:55-11:40',
  '14:00-14:45', '14:50-15:35', '16:05-16:50', '16:55-17:40',
  '19:00-19:45', '19:50-20:35', '20:40-21:25', '21:30-22:15',
];
