# BuildPM — notities voor agents

- De Obsidian-vault is de enige bron. Sla nooit projectdata op in deze repo; de repo is publiek. Testdata hoort in `demo-vault/` (fictief) of in testfixtures.
- Schrijfacties lopen altijd via `vault.update()` (atomair, met versiegeschiedenis en ongedaan maken) en via een parser in `server/md/` die het bestaande format van de notitie respecteert. Nieuwe schrijfacties krijgen een test in `test/`.
- Test nooit schrijfacties tegen de echte vault; gebruik een kopie (`VAULT_PATH=… PROJECT_DIR=…`).
- UI-teksten in het Nederlands. Code-stijl: Prettier (`npm run format`), geen puntkomma's, enkele aanhalingstekens.
- Draait in productie onder pm2 als `buildpm` (`npm run build && pm2 restart buildpm`).
