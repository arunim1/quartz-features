import { QuartzEmitterPlugin } from "../types"
import * as path from "path"
import { write } from "./helpers"
import { FilePath } from "../../util/path"
import { BuildCtx } from "../../util/ctx"
import { ProcessedContent } from "../vfile"
import { StaticResources } from "../../util/resources"
import { QuartzComponent } from "../../components/types"
import chalk from "chalk"
import * as fs from "fs/promises"
import dotenv from "dotenv"
import CryptoJS from "crypto-js"

dotenv.config()

// Function to encrypt the master password for each user
function encryptMasterPassword(masterPassword: string | CryptoJS.lib.WordArray, userPassword: string | CryptoJS.lib.WordArray) {
  return CryptoJS.AES.encrypt(masterPassword, userPassword).toString()
}

function encryptContent(content: string, password: string): string {
  const encryptedText = CryptoJS.AES.encrypt(content, password).toString()
  return `<div class="encrypted-message">🔒This page is locked. Return <a href="/">home</a> and enter a password.`+
  `</div><div class="encrypted-content" style="display: none;">${encryptedText}</div>`
}

export const Encrypt: QuartzEmitterPlugin = () => {
  return {
    name: "Encrypt",
    getQuartzComponents(ctx: BuildCtx): QuartzComponent[] {
      return []
    },
    async emit(ctx: BuildCtx, content: ProcessedContent[], _resources: StaticResources): Promise<FilePath[]> {
      const publicDir = ctx.argv.output
      const contentIndexPath = path.join(publicDir, "static", "contentIndex.json")
      
      // Get master password from env or use default
      let masterPassword = process.env.MASTER_PASSWORD 
      if (!masterPassword) {
        masterPassword = 'sodiumproductpolicyissues'
        console.log(chalk.red('No master password found, using default password'))
      }

      // Encrypt contentIndex.json
      try {
        const contentIndex = JSON.parse(await fs.readFile(contentIndexPath, 'utf-8'))
        for (const key in contentIndex) {
          if (contentIndex[key].content) {
            // Skip tag pages
            if (key.startsWith('tags/')) {
              console.log(chalk.yellow(`Skipping encryption for tag page: ${key}`))
              continue
            }

            // Get corresponding vfile frontmatter for this content
            const contentItem = content.find(([_, vfile]) => vfile.data.slug === key)
            const frontmatter = contentItem ? contentItem[1].data.frontmatter : undefined

            // Skip encryption for public pages
            if (frontmatter?.public) {
              console.log(chalk.yellow(`Skipping encryption for public page: ${key}`))
              continue
            }

            contentIndex[key].content = encryptContent(contentIndex[key].content, masterPassword)
          }
        }
        await fs.writeFile(contentIndexPath, JSON.stringify(contentIndex), 'utf-8')
        console.log(chalk.green('Encrypted content fields in contentIndex.json successfully'))
      } catch (error) {
        console.error(chalk.red('Failed to encrypt content fields in contentIndex.json:', error))
        throw error
      }

      // Get user credentials and create encrypted master passwords
      const userCredentials = JSON.parse(process.env.USER_CREDENTIALS || '[]')
      const encryptedMasterPasswords = userCredentials
        .filter((cred: { enabled: any }) => cred.enabled)
        .map((cred: { id: any; password: any; }) => ({
          id: cred.id,
          encryptedPassword: encryptMasterPassword(masterPassword, cred.password)
        }))

      // Scripts to inject
      const decryptionScript = `<script src="https://cdnjs.cloudflare.com/ajax/libs/crypto-js/4.1.1/crypto-js.min.js"></script>
      <script>
    (function() {
      // Make encryptedMasterPasswords available globally for SPA navigation
      window.encryptedMasterPasswords = ${JSON.stringify(encryptedMasterPasswords)};
    
      function getCookie(name) {
        const value = \`\${document.cookie}\`;
        const parts = value.split(\`; \${name}=\`);
        if (parts.length === 2) return decodeURIComponent(parts.pop().split(';').shift());
      }
    
      function setCookie(name, value, days) {
        let expires = "";
        if (days) {
          const date = new Date();
          date.setTime(date.getTime() + (days * 24 * 60 * 60 * 1000));
          expires = "; expires=" + date.toUTCString();
        }
        document.cookie = name + "=" + encodeURIComponent(value) + expires + "; path=/";
      }
    
      function decryptMasterPassword(encryptedPassword, userPassword) {
        const decrypted = CryptoJS.AES.decrypt(encryptedPassword, userPassword);
        return decrypted.toString(CryptoJS.enc.Utf8);
      }
    
      function authenticateAndGetPassword() {
        // First try to get the decryption password from cookie
        let password = getCookie('decryptionPassword');
        if (password) {
          return password;
        }

        // If no decryption password, try to regenerate it from user password
        const userPassword = getCookie('userPassword');
        if (userPassword) {
          const userEntry = encryptedMasterPasswords.find(entry => userPassword.startsWith(entry.id));
          if (userEntry) {
            try {
              // Try to decrypt the master password using the user password
              password = decryptMasterPassword(userEntry.encryptedPassword, userPassword);
              if (password) {
                // Successfully regenerated master password, store it in cookie
                setCookie("decryptionPassword", password, 1);
                return password;
              }
            } catch (error) {
              console.error("Failed to decrypt master password:", error);
            }
          }
        }
        return null;
      }
    
      function decryptContent(password) {
        const articles = document.querySelectorAll('article.encrypted p');
    
        articles.forEach(p => {
          try {
            const decrypted = CryptoJS.AES.decrypt(p.textContent.trim(), password).toString(CryptoJS.enc.Utf8);
            if (decrypted) {
              const article = p.parentElement;
              if (article) {
                article.innerHTML = decrypted;
                p.classList.remove('encrypted');
                article.classList.add('decrypted');
              }
            }
          } catch (e) {
            console.error('Decryption failed for', p, e);
          }
        });
      }
    
      function checkAndDecrypt() {
        const password = authenticateAndGetPassword();
        if (password) {
          decryptContent(password);
        } 
      }
    
      checkAndDecrypt();
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', checkAndDecrypt);
      } else {
        checkAndDecrypt();
      }
    
      const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
          if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
            checkAndDecrypt();
          }
        });
      });
    
      observer.observe(document.body, { childList: true, subtree: true });
    })();
    </script>`

      const indexLoginScript = `
      <div id="decryptContainer" style="
        display: flex;
        align-items: center;
        gap: 10px;
        margin: 20px 0;
      ">
        <input type="password" id="passwordInput" placeholder="Enter your password" style="
          padding: 10px;
          border: 1px solid #ccc;
          border-radius: 5px;
          font-size: 16px;
          flex: 1;
          font-family: inherit;
        ">
        <button id="decryptButton" style="
          padding: 8px 12px;
          background-color: transparent;
          border-radius: 5px;
          cursor: pointer;
          font-size: 14px;
          transition: background-color 0.3s ease, color 0.3s ease;
          display: flex;
          align-items: center;
          justify-content: center;
          font-family: inherit;
        " 
        onmouseover="this.style.backgroundColor='grey'; this.style.color='white';" 
        onmouseout="this.style.backgroundColor='transparent';">
          🔑
        </button>
      </div>
      <p>If you're still seeing encrypted content, try refreshing the page.</p>
    
      <script>
        const encryptedMasterPasswords = ${JSON.stringify(encryptedMasterPasswords)};
    
        function decryptMasterPassword(encryptedPassword, userPassword) {
          const decrypted = CryptoJS.AES.decrypt(encryptedPassword, userPassword);
          return decrypted.toString(CryptoJS.enc.Utf8);
        }
    
        document.getElementById('decryptButton').addEventListener('click', function() {
          const password = document.getElementById('passwordInput').value;
          
          if (password) {
            const userEntry = encryptedMasterPasswords.find(entry => password.startsWith(entry.id));
            if (userEntry) {
              try {
                const decryptedMasterPassword = decryptMasterPassword(userEntry.encryptedPassword, password);
                if (decryptedMasterPassword) {
                  document.cookie = "decryptionPassword=" + encodeURIComponent(decryptedMasterPassword) + "; path=/; max-age=86400";
                  document.cookie = "userPassword=" + encodeURIComponent(password) + "; path=/; max-age=31536000";
                  alert("Authentication successful. Page will be decrypted momentarily.");
                  location.reload();
                } else {
                  throw new Error("Decryption failed");
                }
              } catch (error) {
                alert("Authentication failed. Please check your password.");
              }
            } else {
              alert("Invalid password. Please check your password and try again.");
            }
          } else {
            alert("Please enter your password.");
          }
        });
      </script>`

      // Process all HTML files recursively
      async function processDirectory(dir: string): Promise<FilePath[]> {
        const processedFiles: FilePath[] = []
        const entries = await fs.readdir(dir, { withFileTypes: true })
        
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name)
          
          if (entry.isDirectory()) {
            // Recursively process subdirectories
            const subDirFiles = await processDirectory(fullPath)
            processedFiles.push(...subDirFiles)
          } else if (entry.name.endsWith('.html')) {
            const fileContent = await fs.readFile(fullPath, 'utf-8')
            
            // Get relative path from publicDir to get the correct slug
            const relativePath = path.relative(publicDir, fullPath)
            const slug = relativePath.slice(0, -5) // remove .html
            
            if (entry.name === 'index.html' && relativePath === 'index.html') {
              // Special handling for index.html
              const newContent = fileContent
                .replace(/<\/article>/, indexLoginScript + '</article>')
                .replace(/<\/head>/, `<script src="https://cdnjs.cloudflare.com/ajax/libs/crypto-js/4.1.1/crypto-js.min.js"></script></head>`)
              await fs.writeFile(fullPath, newContent, 'utf-8')
            } else {
              // Find corresponding content item
              const contentItem = content.find(([_, vfile]) => vfile.data.slug === slug)
              const frontmatter = contentItem ? contentItem[1].data.frontmatter : undefined

              // Skip encryption for public pages
              if (frontmatter?.public || slug.startsWith('tags/')) {
                console.log(chalk.yellow(`Skipping HTML encryption for ${relativePath}`))
                processedFiles.push(fullPath as FilePath)
                continue
              }

              // Handle other HTML files
              const articleRegex = /(<article class="popover-hint">)([\s\S]*?)(<\/article>)/g
              const newContent = fileContent
                .replace(articleRegex, (match, p1, p2, p3) => {
                  const encrypted = encryptContent(p2, masterPassword ?? '')
                  return `<article class="popover-hint encrypted">${encrypted}${p3}`
                })
                .replace(/<head>/, '<head>' + decryptionScript)
              await fs.writeFile(fullPath, newContent, 'utf-8')
            }
            processedFiles.push(fullPath as FilePath)
          }
        }
        return processedFiles
      }

      // Start processing from the public directory
      const processedFiles = await processDirectory(publicDir)

      return processedFiles
    },
  }
}