const {Store}=require('../core/store.cjs');const {Collector}=require('../core/collectors.cjs');const path=require('node:path'),os=require('node:os');
const store=new Store(path.join(os.homedir(),'Library/Application Support/人生档案/data'));
const collector=new Collector(store);
collector.scan().then(stats=>{console.log(JSON.stringify({stats,total:store.summary().total,sources:store.sources().map(({id,name,status,count,detail})=>({id,name,status,count,detail}))},null,2));store.close();}).catch(error=>{console.error(error.message);store.close();process.exitCode=1;});
