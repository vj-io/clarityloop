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
ClarityLoop is a work chat for supervisors and workers who don't share a first language. It has two layers in one conversation. First, chat in your own language: every message is shown in the reader's language (English, Hindi including Hinglish typed in Roman letters, and Tamil), with the original one tap away. Second, a meaning check for instructions: when the supervisor sends a message as a task (action, object, place, time, quantity), the worker cannot tap OK. They must say it back in their own words. AI reads the reply into fixed fields, and plain code, not the AI, compares each field with the supervisor's task. If the task, place, time or quantity differ, a red Meaning Mismatch card appears live in both windows and blocks confirmation until both agree. Example: the supervisor sends "Unload · cement bags · Gate 3 · 14:00 · 40 bags"; the worker replies "40 bori cement Gate 2 pe utaarna hai, 2 baje tak"; the card shows Place: Gate 3 ≠ Gate 2 while everything else matches. It works at crew scale: one task can go to the whole crew, each worker says it back in their own language, and a live roll-call board shows who understood, without showing workers each other's mistakes. Workers can speak instead of type and listen instead of read. The supervisor gets an insights page (caught before work started, most-missed fields) and a printable record of every task. Existing tools translate messages and show read receipts, but a read receipt shows a message was opened, not understood. ClarityLoop is built for construction sites, housekeeping, warehouses and workshops where a misunderstood instruction means rework or injury. It is an extra check, not a safety guarantee, and it does not track location, photos of people or attendance. Read is not understood.
```

## 02 Proof of Nexconn integration

**Nexconn packages used**: tick **Chat SDK**. (Chat UI: no. Call SDK: no.)

**Nexconn App Key**

```
qd46yzrfq1obf
```

**SDK features you used**

```
Chat SDK for Web (@nexconn/chat 26.2.1 + @nexconn/engine): NCEngine.initialize and connect with a server-issued access token; connection status handler with automatic reconnect and token refresh (the "live / offline" chip in every conversation); group channels, one per supervisor-worker pair; sending text messages with SendTextMessageParams from the composer; receiving live messages through a message handler (chat bubbles and cards appear in the other window without reload); message history with createMessagesQuery when a conversation opens or reconnects, de-duplicated by Nexconn message id. Read receipts (needReceipt, sendReadReceiptResponse, onMessageReceiptResponse, read-receipt user queries) shown as "Read 14:02" and "Read by 2 of 3"; unread counts and the channel list (createChannelsQuery, clearUnreadCount) in the inbox; @mentions in crew chat (mentionedInfo) with an unread-mention query; a crew-wide group channel next to the pair channels. Server API: issue access tokens for each user (POST /v4/auth/access-token/issue), create and join group channels, and send group messages from a server bot user. Task cards, comparison cards and Understood/Done cards are plain Nexconn text messages with a prefix, posted only by the server, so both people see every state change live. The Nexconn message id is also the cache key for each message's translation.
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

**Demo video**: not recorded yet. Script: `demo-video-script.md`. Upload to YouTube (unlisted) or Loom and paste the link.

## 04 Write-up

Upload `ClarityLoop-writeup.pdf` from this folder.

## 05 Traction (optional)

Leave empty unless the 21 Nov pilot happens. Only real numbers: users who sent at least one message on this App Key (visible in the Nexconn Console).

## 06 Prior work

**No, built for this challenge.**

## Confirmation box

Tick it yourself after reading the challenge rules and Terms.
