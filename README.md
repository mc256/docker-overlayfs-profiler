# OverlayFS Profiler for Docker

## Prerequisite
##### Disk Tracing Tools: `blktrace`, `blkparse`, `debugfs`
- Ubuntu user: `apt get install blktrace debugfs`
- CentOS user: `yum install blktrace debugfs`



##### Docker: `docker`, `docker-compose`
- https://docs.docker.com/get-docker/
- https://docs.docker.com/compose/install/

## Command

```
Usage: overlay-profile [options] <docker-compose-work-dir> <output-dir> <device> <device-base>

Options:
  -V, --version                                   output the version number
  -i, --interval <interval>                       pause between two actions (ms) (default: 10000)
  -e, --env  <env-file-path>                      .env file location (default: "./.env")
  -y, --docker-compose-yml <docker-compose-file>  .env file location (default: "./docker-compose.yml")
  -q, --quiet                                     do not print any error (default: false)
  -k, --keep-page-cache                           do not purge page cache (default: false)
  -h, --help                                      display help for command
```
It outputs a set of CSV and JSON files. `test/exp-general.ipynb` shows a example of analyzing those log files.





Course Project for CSC2233
