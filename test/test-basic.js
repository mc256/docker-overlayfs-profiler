const assert = require('assert');

const util = require('util');
const exec = util.promisify(require('child_process').exec);
const fs = require('fs').promises;
const path = require('path');


const device = '/dev/nvme0n1';
const sandbox = '/sandbox';
const real_sandbox = '/home/jlchen/experiment/sandbox';

function timeout(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

describe('Utility Libraries', () => {
    before(async function(){
        require('dotenv').config();
    });


    describe("test", async function () {
        it("test", async function () {
        })
    });

    describe("block trace", async function(){
        it("get trace", async function(){
            this.timeout(10000);
            const test = require('../connector/disk_trace');
            test.start_recording(device, (op)=>{
                console.log(JSON.stringify(op));
            });
            await timeout(1000);
            await test.stop_delegate(false);
        })
    });

    describe("docker", async function(){
        it("get docker containers", async function(){
            // get list of running dockers
            let test = require('../connector/docker_connector');
            const containers = await test.get_container_list();
            //console.log(containers);
        });

        it("get docker information", async function(){
            // Get file system information for the docker container
            let test = require('../connector/docker_connector');
            const containers = await test.get_container_list();
            const info = await test.get_container_info(containers[0].container_id);
            //console.log(info);
        });
    });

    describe("debugfs", async function(){
        it("list dir 1", async function(){
            // list directory
            const debugfs = require('../connector/debugfs');
            const dir = await debugfs.list_dir('/',device);
            //console.log(dir);
        });

        it("list dir 2", async function(){
            // list directory
            const debugfs = require('../connector/debugfs');
            const test_content = {
                a: 1,
                b: 2,
                c: 3
            };
            const file_path = path.join(real_sandbox, 'hahaha.txt');
            await fs.writeFile(file_path, JSON.stringify(test_content,null,2),{
                encoding:'utf8'
            });
            const dir = await debugfs.list_dir(sandbox,device);
            //console.log(dir);
        });




        it("list blocks 1", async function(){
            // list directory
            const debugfs = require('../connector/debugfs');
            const test_content = {
                a: 1,
                b: 2,
                c: 3
            };
            const real_file_path = path.join(real_sandbox, 'hahaha.txt');
            const file_path = path.join(sandbox, 'hahaha.txt');

            await fs.writeFile(real_file_path, JSON.stringify(test_content,null,2),{
                encoding:'utf8'
            });

            const blk = await debugfs.list_blocks(file_path,device);

            //console.log(blk);
        });



    });
});
