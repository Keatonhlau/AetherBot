import { ChatInputCommandInteraction } from "discord.js";
declare function handleExtension(interaction: ChatInputCommandInteraction): Promise<void>;
export declare const commands: {
    data: import("discord.js").SlashCommandOptionsOnlyBuilder;
    execute: typeof handleExtension;
}[];
export {};
//# sourceMappingURL=registry.d.ts.map