import { pathToFileURL } from 'node:url';
console.log(JSON.stringify({importUrl:import.meta.url,argvUrl:pathToFileURL(process.argv[1]).href,same:import.meta.url===pathToFileURL(process.argv[1]).href}));
