// Prüft alle Inhaltsdateien: npm run check
import { loadContent, subjects, unitItemCount, contentSource } from './content.js';

const problems = await loadContent();
const source = contentSource();
console.log(`${source.custom ? 'Eigene Aufgaben' : 'Mitgelieferte Aufgaben'} aus ${source.dir}
`);
for (const { meta, units } of subjects.values()) {
  let items = 0;
  for (const u of units.values()) items += unitItemCount(u);
  console.log(`${meta.icon ?? ''} ${meta.name}: ${units.size} Stationen, ${items} Wörter/Aufgaben`);
}
if (problems.length) {
  console.log(`\n${problems.length} Problem(e):`);
  for (const p of problems) console.log(`  - ${p}`);
  process.exit(1);
}
console.log('\nAlles in Ordnung.');
