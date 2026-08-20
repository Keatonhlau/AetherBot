import { ChatInputCommandInteraction } from "discord.js";
declare function handleConfig(interaction: ChatInputCommandInteraction): Promise<void>;
export declare const commands: {
    data: import("discord.js").SlashCommandSubcommandsOnlyBuilder;
    execute: typeof handleConfig;
}[];
export {};
//# sourceMappingURL=admin.d.ts.map