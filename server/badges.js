// Abzeichen: gelten fächerübergreifend. Jedes neue Abzeichen bringt BADGE_BONUS Sterne.
export const BADGE_BONUS = 3;

export const BADGES = [
  { id: 'start', icon: '🚂', name: 'Abfahrt!', desc: 'Deine erste Übung geschafft', test: (s) => s.sessions >= 1 },
  { id: 'sessions10', icon: '🎒', name: 'Fleißig', desc: '10 Übungen geschafft', test: (s) => s.sessions >= 10 },
  { id: 'sessions50', icon: '🏅', name: 'Dranbleiber', desc: '50 Übungen geschafft', test: (s) => s.sessions >= 50 },
  { id: 'sessions150', icon: '🏆', name: 'Lernprofi', desc: '150 Übungen geschafft', test: (s) => s.sessions >= 150 },
  { id: 'perfect1', icon: '💯', name: 'Volltreffer', desc: 'Eine Übung ganz ohne Fehler', test: (s) => s.perfect >= 1 },
  { id: 'perfect10', icon: '🎯', name: 'Treffsicher', desc: '10 Übungen ganz ohne Fehler', test: (s) => s.perfect >= 10 },
  { id: 'streak3', icon: '🔥', name: 'Drei am Stück', desc: '3 Tage hintereinander geübt', test: (s) => s.streak >= 3 },
  { id: 'streak7', icon: '⚡', name: 'Eine ganze Woche', desc: '7 Tage hintereinander geübt', test: (s) => s.streak >= 7 },
  { id: 'streak21', icon: '🌋', name: 'Unaufhaltsam', desc: '21 Tage hintereinander geübt', test: (s) => s.streak >= 21 },
  { id: 'master1', icon: '⭐', name: 'Erste Station gemeistert', desc: 'Eine Station mit 3 Sternen abgeschlossen', test: (s) => s.unitsMastered >= 1 },
  { id: 'master5', icon: '🌟', name: 'Fünf Stationen', desc: '5 Stationen mit 3 Sternen abgeschlossen', test: (s) => s.unitsMastered >= 5 },
  { id: 'master15', icon: '🗺️', name: 'Streckenkenner', desc: '15 Stationen mit 3 Sternen abgeschlossen', test: (s) => s.unitsMastered >= 15 },
  { id: 'items25', icon: '🧠', name: 'Sitzt!', desc: '25 Wörter oder Aufgaben sicher gelernt', test: (s) => s.mastered >= 25 },
  { id: 'items100', icon: '📚', name: 'Wissensspeicher', desc: '100 Wörter oder Aufgaben sicher gelernt', test: (s) => s.mastered >= 100 },
  { id: 'items300', icon: '🎓', name: 'Wandelndes Wörterbuch', desc: '300 Wörter oder Aufgaben sicher gelernt', test: (s) => s.mastered >= 300 },
  { id: 'review5', icon: '🔧', name: 'Fehlerjäger', desc: '5 Fehler-Trainings gemacht', test: (s) => s.reviews >= 5 },
  { id: 'listen50', icon: '🎧', name: 'Gute Ohren', desc: '50 Hör-Aufgaben richtig', test: (s) => s.listen >= 50 },
  { id: 'stars100', icon: '✨', name: '100 Sterne', desc: 'Insgesamt 100 Sterne verdient', test: (s) => s.starsEarned >= 100 },
  { id: 'stars500', icon: '🌠', name: '500 Sterne', desc: 'Insgesamt 500 Sterne verdient', test: (s) => s.starsEarned >= 500 },
  { id: 'combo8', icon: '🚄', name: 'Schnellzug', desc: '8 richtige Antworten hintereinander', test: (s) => s.bestCombo >= 8 },
  { id: 'combo15', icon: '🚅', name: 'Hochgeschwindigkeit', desc: '15 richtige Antworten hintereinander', test: (s) => s.bestCombo >= 15 },
  { id: 'plan1', icon: '📋', name: 'Nach Fahrplan', desc: 'Zum ersten Mal den Tagesfahrplan erfüllt', test: (s) => s.stamps >= 1 },
  { id: 'plan10', icon: '🗓️', name: 'Pünktlich wie die Bahn', desc: '10 Stempel im Stempelheft', test: (s) => s.stamps >= 10 },
  { id: 'plan30', icon: '📒', name: 'Volles Stempelheft', desc: '30 Stempel im Stempelheft', test: (s) => s.stamps >= 30 },
  { id: 'blitz1', icon: '⚡', name: 'Blitzstart', desc: 'Die erste Blitzrunde gespielt', test: (s) => s.blitzRuns >= 1 },
  { id: 'blitz20', icon: '🌩️', name: 'Blitzschnell', desc: '20 Treffer in einer Blitzrunde', test: (s) => s.blitzBest >= 20 },
  { id: 'exam1', icon: '🏁', name: 'Endbahnhof', desc: 'Die erste Endbahnhof-Prüfung bestanden', test: (s) => s.exams >= 1 },
  { id: 'exam3', icon: '🛤️', name: 'Streckennetz', desc: '3 Endbahnhof-Prüfungen bestanden', test: (s) => s.exams >= 3 },
  { id: 'rank5', icon: '🧑‍✈️', name: 'Am Steuer', desc: 'Rang „Lokführer-Azubi“ erreicht', test: (s) => s.level >= 5 },
];

export const publicBadges = () => BADGES.map(({ test, ...b }) => b);
