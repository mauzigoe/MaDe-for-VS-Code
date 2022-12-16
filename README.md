# Matlab Debugger for VS Code 

`MaDe`, Matlab Debugger for VS Code, is an Extension, which helps you to debug `matlab`-scripts in VS Code. Right now it only works on `linux` (maybe `MACOS` too).

The Software is in early development, but already has some basic functionailities (see [Features](#features)).   

## Features

Currently following features are implemented:

- Set and clear breakpoints in your `matlab`-script
- run your `matlab`-script step-wise or run your script onto the next breakpoint or end
- stack trace (only scriptwise rn)
- evaluate variables at runtime ()

## Requirements

- `nodejs` >= v18.12.1

The extension was only tested on `ubuntu 22.04`.

## Getting started

I provided an example under sample

- Download the repository and the `VSIX`-file provided in the [Release](https://github.com/mauzigoe/MaDe-for-VS-Code/releases)-Section. You can also try to build the `VSIX` yourself via this repo.
    - run `npm install` in repo
    - run `vsce package` 
- Install the `VSIX`-File via `Extensions`-Section in VS Code 
- open the `sampleWorkspace/test.m` file 
- press `F5`-File
    - the extension executes `matlab` executable via `/usr/bin/env`, so the `matlab` executable path should be in your `PATH` env. Variable
- After a few seconds the extension should be ready and a yellow pointer should indicate your position (at the beginning).
- You can now run your program stepwise or set breakpoint (for more see [Features](#features))

If something does not work, please open an issue :) 

## Next Steps

The next feature to come would be:
- improve the code and repo structe and add some explaination
- improve the debugging features
    - `step-in`
    - `set variable`
- add testing
