const assert = require('assert');

const util = require('util');
const exec = util.promisify(require('child_process').exec);
const fs = require('fs').promises;
const path = require('path');


const device = '/dev/nvme0n1';
const sandbox = '/sandbox';
const real_sandbox = '/mnt/experiment/sandbox';

function timeout(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

describe('Utility Libraries', () => {
    before(async function(){
        require('dotenv').config();
    });



    describe("block trace", async function(){
        it("get trace", async function(){
            this.timeout(-1);
            console.log(process.pid);


            const trace = require('../connector/disk_trace');
            const debugfs = require('../connector/debugfs');
            trace.start_recording(device, (op)=>{
                if ((!op.command.startsWith('kworker')) || (!op.command.startsWith('swapper'))){
                    console.log(op.sector / 8 + " "+ op.command);
                }
            });
            await timeout(1000 * 10);

            let buf = "";
            for (let i = 0; i < 1000; i ++){
                buf += "____" + Math.random();
            }

            const file_name = 'run'+ Math.round(Math.random() * 8999 + 1000)+ '.txt';
            console.log("=====> "+ file_name);
            const real_file_path = path.join(real_sandbox, file_name);
            const file_path = path.join(sandbox, file_name);

            await fs.writeFile(real_file_path, buf);
            console.log('wrote');

            let blk = [];
            while (blk.length === 0){
                blk = await debugfs.list_blocks(file_path,device);
                await timeout(1000);
                console.log('checking');
            }
            console.log(blk);

            await timeout(1000 * 10);


            await trace.stop_delegate(false);
        })


    });


});
