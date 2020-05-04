const assert = require('assert');

const util = require('util');
const exec = util.promisify(require('child_process').exec);
const fs = require('fs').promises;
const path = require('path');

const sandbox = './temp/exp6';

function timeout(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function get_round_number() {
    return Math.round(Math.random() * 8999 + 1000) + "";
}

async function load_json(file_name) {
    const config = await fs.readFile(path.join(sandbox, file_name));
    return JSON.parse(config);
}


async function load_csv(file_name) {
    const config = await fs.readFile(path.join(sandbox, file_name), {encoding:'utf8'});
    return config.split('\n').map(row => {
        const col = row.split(',');
        return {
            ts: parseFloat(col[0]),
            a: col[1],
            r: col[2],
            seq: parseInt(col[3]),
            sec: parseInt(col[4]),
            cmd: col[5],
        };
    });
}


async function find_sector(target, file_list){
    for (const image in file_list){
        if (file_list.hasOwnProperty(image)){
            for (const layer_file_name of file_list[image]){
                const layer = await load_json(layer_file_name.replace(':','_'));
                //console.log(layer.b2f);
                //console.log(layer_file_name + '-->' + layer.b2f.length);

                /*
                let left = 0;
                let right = layer.b2f.length - 1;
                while (left <= right){
                    const mid = Math.floor((left + right)/2);

                    if (layer.b2f[mid][1] > target){
                        left = mid + 1;
                    }
                    if (layer.b2f[mid][0] < target){
                        right = mid - 1;
                    }
                }

                if (0 <= left && layer.b2f.length > left) {
                    //console.log(layer.b2f[left]);
                    if (layer.b2f[left][0] <= target && layer.b2f[left][1] >= target){
                        return {
                            layer: layer_file_name,
                            file: layer.b2f[left][0][2]
                        }
                    }
                }
                */

                let i = 0;
                for (; i < layer.b2f.length; i++){
                    if (layer.b2f[i][0] > target){
                        i --;
                        break;
                    }
                }
                if (i === -1) continue;
                if (i === layer.b2f.length) continue;
                if (layer.b2f[i][0] <= target && layer.b2f[i][1] >= target){
                    return {
                        layer: layer_file_name,
                        file: layer.b2f[i]
                    }
                }
            }


        }
    }

    return null;
}

describe('Experiment', () => {
    before(async function () {
        require('dotenv').config();
    });

    describe("docker", async function () {


        it("start container", async function () {
            this.timeout(-1);

            const sandbox = './temp/exp6';
            let log_action = await  load_json('output.json');
            console.log(log_action);

            // Load Tracing Information

            const traces = await load_csv(log_action.trace);
            //console.log(traces);


            const b2f_file_name = 'b2f-cold.csv';
            const b2f_path = path.join(sandbox, b2f_file_name);
            const b2f_handler = await fs.open(b2f_path, 'a');
            let merge = [];
            for (const image in log_action.cold){
                if (log_action.cold.hasOwnProperty(image)){
                    for (const layer_file_name of log_action.cold[image]){
                        const layer = await load_json(layer_file_name.replace(':','_'));

                        for (const row of layer.b2f){
                            await fs.appendFile(b2f_handler,  row + ',' + layer_file_name +'\n', 'utf8');
                        }
                    }
                }
            }

        });
    });








});