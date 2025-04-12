#!/bin/sh


export GITREPO="$GITREPO"


git clone $GITREPO /home/app/output

exec node script.js