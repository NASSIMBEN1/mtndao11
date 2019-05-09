const parseMessageForwardingCommand = require("./parse-message-forwarding-command");
const sendMessageWithCustomAuthor = require("./send-message-with-custom-author");

/**
 * Ooh, the behavioral meat of the bot! The message handler function!
 *
 * This function handles all messages the bot can see, and dispatches them to
 * special handlers for messages from the mirror server vs source servers.
 */
async function handleMessage(message, serverSet, identities, restart) {
    try {
        const server = serverSet.getServerById(message.guild.id);

        if (message.author.bot) {
            // Ignore bot messages, especially our own. We don't expect our
            // messages to, like, start with shortcodes or anything... but it
            // removes a class of bug and reduces log noise!
            return;
        } else if (server.isMirrorServer) {
            try {
                await handleMessageFromMirrorServer(
                    message,
                    serverSet,
                    identities,
                    restart
                );
            } catch (e) {
                // On the mirror server, in addition to our normal error
                // handling, we print a special error message to the user.
                // (We don't do this on source servers, because yikes it would
                // be noisy if we had a bug yelling about every message!)
                message.reply("⛔️ " + e);
                throw e;
            }
        } else if (server.isSourceServer) {
            await handleMessageFromSourceServer(message, serverSet);
        } else {
            console.warn(
                `⚠️  Received message from unexpected server ${
                    message.guild.name
                }.`
            );
        }
    } catch (e) {
        console.error(`⛔️  Error handling message.`, e);
    }
}

/**
 * Handle a message from the mirror server. This is probably a message for us
 * to forward as a specific identity, but it could also be a special command.
 */
async function handleMessageFromMirrorServer(
    message,
    serverSet,
    identities,
    restart
) {
    // "ping" command to help test the bot is online!
    if (message.content === "ping") {
        console.log("⭐️  Ping!");
        message.reply("Pong! 💖");
        return;
    }

    // "restart" command to help us re-initialize, e.g. if our channels or
    // server invites have updated!
    if (message.content === "restart") {
        console.log("❗️  Restarting!");
        await message.reply("❗️  Restarting!");
        restart();
        return;
    }

    // Otherwise, let's try to parse this as a message to forward, by reading
    // the identity prefix from the message body. (If this doesn't work, this
    // is probably a mis-formatted message, abort the handler!)
    const parsedMessage = parseMessageForwardingCommand(
        message.content,
        identities
    );
    if (!parsedMessage) {
        console.warn(
            `⚠️  Message from mirror server did not start with an identity shortcode.`
        );
        message.reply(`⚠️  Didn't understand that message 😓`);
        return;
    }

    const { body, identity } = parsedMessage;

    // Additionally, let's figure out where this message should go.
    const mirrorChannel = message.channel;
    const sourceChannel = serverSet.getSourceChannelFor(mirrorChannel);
    if (!sourceChannel) {
        console.warn(
            `⚠️  Got a forwardable message in #${mirrorChannel.name}, but ` +
                `couldn't find a matching source channel. "${body}"`
        );
        message.reply(
            `⚠️  This channel isn't connected to a source server, so I ` +
                `can't forward this message. Is that what you were trying ` +
                `to do? If so, double-check that we were able to connect to ` +
                `the desired source server, and that the channel exists.`
        );
        return;
    }

    console.log(
        `✉️  [${sourceChannel.guild.name} #${sourceChannel.name}] ${
            identity.name
        }: ${body}`
    );

    // Okay, cool! Let's forward the message, and let the user know we did.
    await sendMessageWithCustomAuthor(body, sourceChannel, {
        username: identity.name,
        avatarURL: identity.avatarURL,
    });
    message.react("✅");
}

/**
 * Handle a message from the source server. This is always pretty simple: just
 * forward the message to the corresponding mirror channel.
 */
async function handleMessageFromSourceServer(message, serverSet) {
    const sourceChannel = message.channel;
    const mirrorChannel = serverSet.getMirrorChannelFor(sourceChannel);

    const body = message.content;

    console.log(
        `📬  [${sourceChannel.guild.name} #${sourceChannel.name}] ${
            message.author.username
        }: ${body}`
    );

    await sendMessageWithCustomAuthor(message.content, mirrorChannel, {
        username: message.author.username,
        avatarURL: message.author.avatarURL,
    });
}

module.exports = handleMessage;
