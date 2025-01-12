# Quartz v4

With a plugin that converts from logseq-style indentation to the expected input markdown, for fellow Logseq users. 

How to use this (or at least how *I* use it):
- Fork / clone this branch of the repo
- Create a new Logseq graph in your `content` folder
- Update `.gitignore` to exclude relevant items (keep assets, but ignore subfolders and the Logseq folder)
- Modify `config.edn` in the new Logseq graph (unless you want to keep the default `pages` and `journals` folders):
	- Change the base folder to the pages-directory instead of pages
	- Replace "pages" with an empty string ""
- That should cover the basics. Start writing!

Current issues: 
- probably some that I just don't notice. but i think it's mostly pretty solid. 
