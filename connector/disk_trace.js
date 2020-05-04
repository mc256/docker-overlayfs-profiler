const quote = require('shell-quote').quote;
const spawn = require('child_process').spawn;
const exec = require('child_process').exec;

class disk_trace{

    constructor() {
        this.is_colleting = false;
        this.blktrace = null;
        this.blkparse = null;
        this.delegation = null;
    }

    exception_handler(stderr){
        console.error(`stderr: ${stderr}`);
    }

    callback_handler(callback_message){
        const op = String(callback_message).split('\n');
        for (const line of op){
            //console.log(line);
            const params = String(line).split(']');
            if (params.length === 9){
                if (this.delegation !== null){
                    this.delegation(
                        {
                            timestamp: parseFloat(params[0]),
                            pid: parseInt(params[1]),
                            action: params[2],
                            rwbs: params[3],
                            nblock: parseInt(params[4]),
                            nbytes: parseInt(params[5]),
                            sector: parseInt(params[6]),
                            sequence: parseInt(params[7]),
                            command: params[8],
                        }
                    );
                }
            }
        }

    }

    start_recording(device, delegate){
        this.delegation = delegate;
        this.blktrace = spawn('blktrace', ['-d', device, '-a', 'fs', '-o', '-']);
        this.blkparse = spawn('blkparse', ['-f', '%T.%t]%p]%a]%d]%n]%N]%S]%s]%C\n', '-i', '-' ,'-q']);

        // blktrace --------------------------------------------
        this.blktrace.stdout.on('data', (data) => {
            this.blkparse.stdin.write(data);
        });

        this.blktrace.stderr.on('data', (data) => {
            this.exception_handler(data);
        });

        this.blktrace.on('close', (code) => {
            this.blkparse.stdin.end();
        });


        // blkparse --------------------------------------------
        this.blkparse.stdout.on('data', (data) => {
            this.callback_handler(data);
        });

        this.blkparse.stderr.on('data', (data) => {
            this.exception_handler(data);
        });

        this.blkparse.on('close', (code) => {
            this.blktrace = undefined;
            this.blkparse = undefined;
        });

    }

    async stop_delegate(force = true) {
        if (force) {
            await exec('killall -9 blktrace');
        } else {
            this.blktrace.kill();
        }

    }

}

module.exports = new disk_trace();