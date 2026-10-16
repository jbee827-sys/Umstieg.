/**
 * Version für den User-Agent (F7). Als Konstante statt aus `package.json`
 * gelesen: Der Container startet `dist/server.js`, und ob `package.json`
 * daneben liegt, ist eine Eigenschaft des Images, nicht des Codes.
 * `test/motis-client.test.ts` hält beide Angaben gleich.
 */
export const APP_VERSION = '2.0.0';
