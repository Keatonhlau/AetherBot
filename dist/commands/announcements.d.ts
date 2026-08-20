import { ChatInputCommandInteraction } from "discord.js";
declare function handleAnnounceChannel(interaction: ChatInputCommandInteraction): Promise<void>;
export declare const commands: {
    data: import("discord.js").SlashCommandSubcommandsOnlyBuilder;
    execute: typeof handleAnnounceChannel;
}[];
export {};
//# sourceMappingURL=announcements.d.ts.map