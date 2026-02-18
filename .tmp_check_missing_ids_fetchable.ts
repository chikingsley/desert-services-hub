import { chunk } from "./apps/background-jobs/workers/estimate-poller/lib/sql-utils";
import { query } from "./packages/monday/src/client/query";

const ids = [
"11199833654","11200086157","11201431673","11208078651","11225897453","11227716156","11230197935","11230566962","11230672975","11240050317","11250293411","11253234800","11253419960","11253478107","11254025460","11259919743","11263619581","11274556816","11274758809","11275061344","11285361649","11285837989","11287479030","11287969549","11296397428","11296458003","11296488703","11296859990","11296906378","11296938514","11297062402","11297537947","11297615509","11297636316"
];

const found: Array<{id:string; boardId:string; groupTitle:string|null; name:string}> = [];
for (const b of chunk(ids, 100)) {
  const res = await query<{items:Array<{id:string; name:string; board:{id:string}; group:{title:string}|null}>}>(`
    query {
      items(ids: [${b.join(",")}]) {
        id
        name
        board { id }
        group { title }
      }
    }
  `);
  for (const it of res.items) found.push({id:it.id, boardId:it.board.id, groupTitle:it.group?.title ?? null, name:it.name});
}

const foundSet = new Set(found.map((f)=>f.id));
const missing = ids.filter((id)=>!foundSet.has(id));

console.log(JSON.stringify({
  requested: ids.length,
  found: found.length,
  not_found: missing.length,
  not_found_ids: missing,
  found_items: found
}, null, 2));
