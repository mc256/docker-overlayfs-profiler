const promisify = require('util').promisify;
const quote = require('shell-quote').quote;
const exec = promisify(require('child_process').exec);
const path = require('path');

class debugfs{
    constructor() {
    }

    async list_dir(dir, device){
        try{
            const internal_cmd = quote(['ls', '-p']) + ' "' + dir + '"';
            const {stdout, stderr} = await exec(quote(["debugfs", device, "-R", internal_cmd]));
            let dirs = [];
            if (stdout !== ""){
                const lines = String(stdout).split('\n');
                for (const l of lines){
                    if (l !== ''){
                        const args = l.split('/').filter(arg => arg !=='');
                        dirs.push({
                            inode: args[0],
                            type: args[1],
                            uid: args[2],
                            gid: args[3],
                            name: args[4],
                            size: args[5],
                        })

                    }
                }
            }
            return dirs;
        }catch (e) {
            console.log(e);
            return [];
        }
    }

    async list_blocks(file, device, debug=false){
        try{
            const internal_cmd = quote(['ex']) + ' "' + file + '"';
            const {stdout, stderr} = await exec(quote(["debugfs", device, "-R", internal_cmd]));
            if (debug){
                console.log(stdout);
                console.log(quote(["debugfs", device, "-R", internal_cmd]));
            }
            let blocks = [];
            if (stdout !== ""){
                const lines = String(stdout).split('\n');
                lines.shift();
                for (const l of lines){
                    if (l !== '') {
                        const args = l.split(' ').filter(arg => (arg !=='' && arg !== '-')).map(value=>{
                            if (value.endsWith('/')){
                                return value.substr(0, value.length - 1);
                            }
                            return value;
                        });
                        blocks.push({
                            level: args[0],
                            leveln: args[1],
                            entry: args[2],
                            entryn: args[3],
                            logical: args[4],
                            logicaln: args[5],
                            physical: args[6],
                            physicaln: args[7],
                            length: args[8],
                        });
                    }
                }
            }
            return blocks;
        }catch (e) {
            console.log(e);
            return [];
        }
    }

    async list_dir_recursive(dir, device){
        let buffer = [];
        let cur = 0;
        let temp = await this.list_dir(dir, device);
        buffer.push(...temp.filter(v => v.name !=='.' && v.name !== '..'));
        while(cur < buffer.length){
            if (! !!buffer[cur].size){
                temp = await this.list_dir(path.join(dir, buffer[cur].name), device);
                temp = temp
                    .filter(v => v.name !=='.' && v.name !== '..')
                    .map(v => {v.name = path.join(buffer[cur].name, v.name); return v});
                buffer.push(...temp);
            }
            cur ++;
        }
        return buffer;
    }


    async list_block_recursive(dir, device){
        let file_list = await this.list_dir_recursive(dir, device);

        for (let i = 0; i < file_list.length; i++){
            file_list[i].blk = await this.list_blocks(path.join(dir, file_list[i].name), device, false);
        }
        return file_list;
    }


    async block_file_mapping(file_list){
        let buffer = [];
        for (const item of file_list){
            for (const blk of item.blk){
                if (!!blk.length){
                    buffer.push([parseInt(blk.physical), parseInt(blk.physicaln), item.name]);
                }else{
                    buffer.push([parseInt(blk.physical), parseInt(blk.physical) +  parseInt(blk.physicaln), item.name]);
                }

            }
        }
        /*
        buffer.sort((a,b)=>{
            return a[0] - b[0];
        });
        */
        return buffer;
    }

    async clear_file_cache(){
        const {stdout, stderr} = await exec('bash -c "sync;echo 3 > /proc/sys/vm/drop_caches"');
        console.log(stdout);
        console.log(stderr);
        return stdout;
    }
}




const obj = new debugfs();
module.exports = obj;