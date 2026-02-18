import { db } from "@lib/db/hub";

const ids = [
"11199833654","11200086157","11201431673","11208078651","11225897453","11227716156","11230197935","11230566962","11230672975","11240050317","11250293411","11253234800","11253419960","11253478107","11254025460","11259919743","11263619581","11274556816","11274758809","11275061344","11285361649","11285837989","11287479030","11287969549","11296397428"
];
const placeholders = ids.map(()=>"?").join(",");
const rows = await db.query<{monday_item_id:string; id:number; name:string|null; email:string|null}>(`SELECT monday_item_id,id,name,email FROM contacts WHERE monday_item_id IN (${placeholders}) ORDER BY monday_item_id`).all(...ids);
console.log(JSON.stringify({requested:ids.length,local_found:rows.length,rows},null,2));
