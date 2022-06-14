// Copyright (c) .NET Foundation and contributors. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for full license information.

import * as contracts from "./contracts";
import { Kernel } from "./kernel";
import { KernelHost } from "./kernelHost";
import { KernelInfo } from "./contracts";

export class CompositeKernel extends Kernel {


    private _host: KernelHost | null = null;
    private readonly _namesTokernelMap: Map<string, Kernel> = new Map();
    private readonly _kernelToNamesMap: Map<Kernel, Set<string>> = new Map();

    defaultKernelName: string | undefined;

    constructor(name: string) {
        super(name);
    }

    get childKernels() {
        return [...this._kernelToNamesMap.keys()];
    }

    get host(): KernelHost | null {
        return this._host;
    }

    set host(host: KernelHost | null) {
        this._host = host;
        if (this._host) {
            this._host.addKernelInfo(this, { localName: this.name.toLowerCase(), aliases: [], supportedDirectives: [], supportedKernelCommands: [] });

            for (let kernel of this.childKernels) {
                let aliases = [];
                for (let name of this._kernelToNamesMap.get(kernel)!) {
                    if (name !== kernel.name) {
                        aliases.push(name.toLowerCase());
                    }
                }
                this._host.addKernelInfo(kernel, { localName: kernel.name.toLowerCase(), aliases: [...aliases], supportedDirectives: [], supportedKernelCommands: [] });
            }
        }
    }

    add(kernel: Kernel, aliases?: string[]) {
        if (!kernel) {
            throw new Error("kernel cannot be null or undefined");
        }

        if (!this.defaultKernelName) {
            // default to first kernel
            this.defaultKernelName = kernel.name;
        }

        kernel.parentKernel = this;
        kernel.rootKernel = this.rootKernel;
        kernel.subscribeToKernelEvents(event => {
            this.publishEvent(event);
        });
        this._namesTokernelMap.set(kernel.name.toLowerCase(), kernel);

        let kernelNames = new Set<string>();
        kernelNames.add(kernel.name);
        if (aliases) {
            aliases.forEach(alias => {
                this._namesTokernelMap.set(alias.toLowerCase(), kernel);
                kernelNames.add(alias.toLowerCase());
            });
        }

        this._kernelToNamesMap.set(kernel, kernelNames);

        let kernelInfo: KernelInfo = {
            localName: kernel.name,
            aliases: aliases === undefined ? [] : [...aliases],
            languageName: "",
            supportedKernelCommands: [],
            supportedDirectives: []
        };

        this.host?.addKernelInfo(kernel, kernelInfo);
    }

    findKernelByName(kernelName: string): Kernel | undefined {
        if (kernelName.toLowerCase() === this.name.toLowerCase()) {
            return this;
        }

        return this._namesTokernelMap.get(kernelName.toLowerCase());
    }

    handleCommand(commandEnvelope: contracts.KernelCommandEnvelope): Promise<void> {

        let kernel = commandEnvelope.command.targetKernelName === this.name
            ? this
            : this.getTargetKernel(commandEnvelope.command);

        if (kernel === this) {
            return super.handleCommand(commandEnvelope);
        } else if (kernel) {
            return kernel.handleCommand(commandEnvelope);
        }

        return Promise.reject(new Error("Kernel not found: " + commandEnvelope.command.targetKernelName));
    }

    getTargetKernel(command: contracts.KernelCommand): Kernel | undefined {
        let targetKernelName = command.targetKernelName ?? this.defaultKernelName ?? this.name;

        let kernel = this.findKernelByName(targetKernelName);
        return kernel;
    }
}