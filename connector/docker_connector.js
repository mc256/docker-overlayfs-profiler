const promisify = require('util').promisify;
const quote = require('shell-quote').quote;
const exec = promisify(require('child_process').exec);


/*
*
* If we planned to use Docker Compose, we can use ``
*
* */
class docker_connector{
    constructor() {

    }

    async get_container_list(){
        try{
            const {stdout, stderr} = await exec(quote(["docker", "container","ls", "--no-trunc"]));
            let containers = [];
            if (stderr === ""){
                const lines = String(stdout).split('\n');
                lines.shift();
                for (const l of lines){
                    if (l !== ''){
                        const args = l.split(' ').filter(arg => arg !=='');
                        containers.push({
                            container_id: args[0],
                            name: args[1]
                        })
                    }
                }
            }
            return containers;
        }catch (e) {
            console.log(e);
            return [];
        }
    }

    async get_container_info(container_id){
        try{
            const {stdout, stderr} = await exec(quote(["docker", "inspect",container_id]));
            if (stderr === ""){
                const info = JSON.parse(stdout)[0];
                if (! !! info) return null;

                // Driver
                let driver_info = {};
                const driver = info['GraphDriver'];
                if (! !!driver) return null;
                const driver_type = driver['Name'];
                if (driver_type === 'overlay2'){
                    driver_info = {
                        type: driver_type,
                            lower: String(driver['Data']['LowerDir']).split(':'),
                        upper: String(driver['Data']['UpperDir']),
                        work: String(driver['Data']['WorkDir']),
                        merged: String(driver['Data']['MergedDir'])
                    }
                }else{
                    driver_info = {
                        type: driver_type
                    }
                }

                // Mounts
                let mount_info = {
                    mount_rw: [],
                    mount_ro: []
                };
                const mount = info['Mounts'];
                for (const folder of mount){
                    if (folder['RW']){
                        mount_info.mount_rw.push(folder['Source'])
                    }else{
                        mount_info.mount_ro.push(folder['Source'])
                    }
                }



                // Process
                let process_info = {};
                const state  = info['State'];
                if (! !!state) return null;
                process_info = {
                    startedAt : state['StartedAt'],
                    pid : state['Pid'],
                    running: state['Running']
                };


                // Conclude
                return {
                    ...driver_info,
                    ...process_info,
                    ...mount_info
                }

            }else{
                return null;
            }
        }catch (e) {
            console.log(e);
            return null;
        }
    }


    async docker_compose(compose_path, project_directory, env_file, operation){
        try{
            const {stdout, stderr} = await exec(quote([
                "docker-compose",
                "-f", compose_path,
                "--project-directory", project_directory,
                "--env-file", env_file,
                operation, (operation === 'up' ? '-d': '')
            ]));
            return stderr;
        }catch (e) {
            console.log(e);
            return null;
        }
    }

}


const obj = new docker_connector();
module.exports = obj;