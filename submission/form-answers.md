# Submission form answers — copy and paste

Form: https://reskilll.com/hack/nexconn/dashboard/submit
Team: **Kaching** (Vaibhav Jangid). One submission per team; editable until Mon 23 Nov, 5:29 PM IST.

## Step 2 — Track

**Workplace & Collaboration**

## 01 Project

**Project name**

```
ClarityLoop
```

**One-paragraph summary** (under 2000 characters)

```
ClarityLoop is a work chat for supervisors and workers who don't share a language. Everyone reads and writes in their own language (English, Hindi including Hinglish typed in Roman letters, Tamil; Bengali, Telugu and Marathi in beta), with the original one tap away.

For instructions that must be right, the supervisor sends a task. The worker cannot tap OK: they say it back in their own words. AI reads the reply into fixed fields; plain code, not the AI, compares each field with the task. A red Meaning Mismatch card appears live in both windows and blocks Confirm until both agree. The supervisor can accept an unclear field only when the worker gave a value: a bare "OK sir" cannot be clicked through. Example: "Unload · cement bags · Gate 3 · 14:00 · 40 bags" is answered "40 bori cement Gate 2 pe utaarna hai, 2 baje tak": Place shows Gate 3 vs Gate 2, the rest matches.

It works at crew scale: crew chat, a task for the whole crew with a live roll-call board (workers never see each other's mistakes), and a safety briefing check where each worker says the supervisor's chosen safety points back and code checks that every point was said. Also: voice input and read-aloud, site words (a crew glossary the supervisor approves), "Make this a task" from a chat message, "Send again" for recent tasks, reminders for tasks nobody has said back, insights for tasks and briefings with a CSV download, and printable task and briefing records. Chat, cards, read receipts, unread counts and @mentions run on the Nexconn Chat SDK.

A read receipt shows a message was opened, not understood. ClarityLoop is an extra check, not a safety guarantee. No location, photos of people or attendance. No pilot has run yet and no native speaker has rated the translations. Read is not understood.
```

## 02 Proof of Nexconn integration

**Nexconn packages used**: tick **Chat SDK**. (Chat UI: no. Call SDK: no.)

**Nexconn App Key**

```
qd46yzrfq1obf
```

**SDK features you used**

```
Chat SDK for Web (@nexconn/chat 26.2.1 + @nexconn/engine). Connection: NCEngine.initialize, addConnectionStatusHandler and connect with a server-issued access token; automatic retry with a fresh token (the "live / offline" chip). Messaging: group channels, one per supervisor-worker pair and one per crew; GroupChannel.sendMessage with SendTextMessageParams (needReceipt, and mentionedInfo for @mentions); NCEngine.addMessageHandler with onMessageReceived (live bubbles and cards in the other window) and onMessageReceiptResponse; BaseChannel.createMessagesQuery for history on open and reconnect, de-duplicated by message id. Read receipts: sendReadReceiptResponse, getMessageReadReceiptInfo and createMessagesReadReceiptUsersQuery, shown as "Read 14:02" and "Read by 2 of 3". Inbox: createChannelsQuery for unread counts, clearUnreadCount, and createUnreadMentionMeChannelsQuery for unread @mentions. Messages typed before the connection is live, or offline, are queued in the app and sent once connected.

Server REST API (signed with App-Key, Nonce, Timestamp, Signature headers): POST /v4/auth/access-token/issue (register each user and issue tokens), /v4/group-channel/create and /v4/group-channel/join (pair and crew channels), /v4/group-channel/message/send from a bot user. Task, comparison, roll-call board, safety-briefing and state cards are plain text messages with a prefix ([[CL:TASK]], [[CL:CHECK]], [[CL:STATE]], [[CL:BOARD]], [[CL:BRIEF]]), posted only by the server, so every state change reaches both people live; typed text that starts like a card is shown as an ordinary message. The same send endpoint also posts silent, non-stored pings (shouldPersist 0) that make open windows refresh without adding to history or unread counts. Each translation is cached under the Nexconn message id together with a hash of the text it was made from.
```

## 03 Links

**Live app**

```
https://clarityloop-theta.vercel.app
```

**Public GitHub repository**

```
https://github.com/vj-io/clarityloop
```

**Demo video**: file `ClarityLoop-demo-v3.mp4` (2:40, narrated, 69 MB) in this folder. Beats: `demo-video-script.md`. Upload to YouTube (unlisted) or Loom with the link visible to anyone, and paste the link.

## 04 Write-up

Upload `ClarityLoop-writeup.pdf` from this folder.

## 05 Traction (optional)

Leave empty unless the 21 Nov pilot happens. Only real numbers: users who sent at least one message on this App Key (visible in the Nexconn Console).

## 06 Prior work

**No, built for this challenge.**

## Confirmation box

Tick it yourself after reading the challenge rules and Terms.
