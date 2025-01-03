# Quartz v4

This is a fork of Quartz! See original README below. This fork adds support for partially and selectively encrypting content on your site, and password protection of this content. Feel free to clone this repo and use it, or just check the [changes](https://github.com/jackyzha0/quartz/commit/efce252d283c4da5ccd6849fdf8e70d66af98699) made to:
- [package.json](/package.json) 
- [quartz.config.ts](/quartz.config.ts)
- [quartz/plugins/emitters/encrypt.ts](/quartz/plugins/emitters/encrypt.ts)
- [quartz/plugins/emitters/index.ts](/quartz/plugins/emitters/index.ts)
- [quartz/components/scripts/popover.inline.ts](/quartz/components/scripts/popover.inline.ts)
- [quartz/components/scripts/search.inline.ts](/quartz/components/scripts/search.inline.ts)
- [quartz/components/scripts/spa.inline.ts](/quartz/components/scripts/spa.inline.ts)

You're also welcome to improve this fork, it's pretty inelegant at the moment, likely even has some bugs. 

TODO
- ideally, add tests to automate process of checking whether the fork works with the most up-to-date version of quartz
- make it easier to change how the encryption works, whether it's the default, what the "frontmatter tag" associated with it is, etc., via quartz.config.ts  
- more elegant way of including scripts in the emit process than writing them as a string
- I think popovers in the table of contents fail right now? They work on my website though, so likely caused by a quartz update. 

DONE
- fails to encrypt content in folders, subfolders. 
- fails to encrypt contentindex / search in general. 
- see files: popover.inline.ts, search.inline.ts, spa.inline.ts, and encrypt.inline.ts in the garden. 
- add an example .env file


> “[One] who works with the door open gets all kinds of interruptions, but [they] also occasionally gets clues as to what the world is and what might be important.” — Richard Hamming

Quartz is a set of tools that helps you publish your [digital garden](https://jzhao.xyz/posts/networked-thought) and notes as a website for free.
Quartz v4 features a from-the-ground rewrite focusing on end-user extensibility and ease-of-use.

🔗 Read the documentation and get started: https://quartz.jzhao.xyz/

[Join the Discord Community](https://discord.gg/cRFFHYye7t)

## Sponsors

<p align="center">
  <a href="https://github.com/sponsors/jackyzha0">
    <img src="https://cdn.jsdelivr.net/gh/jackyzha0/jackyzha0/sponsorkit/sponsors.svg" />
  </a>
</p>
