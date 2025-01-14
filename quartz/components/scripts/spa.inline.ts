import micromorph from "micromorph"
import { FullSlug, RelativeURL, getFullSlug, normalizeRelativeURLs } from "../../util/path"
import { fetchCanonical } from "./util"

// Add this interface declaration
declare global {
  interface Window {
    quartzDecrypt?: () => void;
    addCleanup: (fn: (...args: any[]) => void) => any;
    encryptedMasterPasswords?: Array<{ id: string, encryptedPassword: string }>;
    spaNavigate: (url: URL, isBack?: boolean) => any;
  }
}

// adapted from `micromorph`
// https://github.com/natemoo-re/micromorph
const NODE_TYPE_ELEMENT = 1
let announcer = document.createElement("route-announcer")
const isElement = (target: EventTarget | null): target is Element =>
  (target as Node)?.nodeType === NODE_TYPE_ELEMENT
const isLocalUrl = (href: string) => {
  try {
    const url = new URL(href)
    if (window.location.origin === url.origin) {
      return true
    }
  } catch (e) {}
  return false
}

const isSamePage = (url: URL): boolean => {
  const sameOrigin = url.origin === window.location.origin
  const samePath = url.pathname === window.location.pathname
  return sameOrigin && samePath
}

const getOpts = ({ target }: Event): { url: URL; scroll?: boolean } | undefined => {
  if (!isElement(target)) return
  if (target.attributes.getNamedItem("target")?.value === "_blank") return
  const a = target.closest("a")
  if (!a) return
  if ("routerIgnore" in a.dataset) return
  const { href } = a
  if (!isLocalUrl(href)) return
  return { url: new URL(href), scroll: "routerNoscroll" in a.dataset ? false : undefined }
}

function notifyNav(url: FullSlug) {
  const event: CustomEventMap["nav"] = new CustomEvent("nav", { detail: { url } })
  document.dispatchEvent(event)
}

const cleanupFns: Set<(...args: any[]) => void> = new Set()
window.addCleanup = (fn) => cleanupFns.add(fn)

function startLoading() {
  const loadingBar = document.createElement("div")
  loadingBar.className = "navigation-progress"
  loadingBar.style.width = "0"
  if (!document.body.contains(loadingBar)) {
    document.body.appendChild(loadingBar)
  }

  setTimeout(() => {
    loadingBar.style.width = "80%"
  }, 100)
}

let p: DOMParser
async function navigate(url: URL, isBack: boolean = false) {
  startLoading()
  p = p || new DOMParser()
  const contents = await fetchCanonical(url)
    .then((res) => {
      const contentType = res.headers.get("content-type")
      if (contentType?.startsWith("text/html")) {
        return res.text()
      } else {
        window.location.assign(url)
      }
    })
    .catch(() => {
      window.location.assign(url)
    })

  if (!contents) return

  // cleanup old
  cleanupFns.forEach((fn) => fn())
  cleanupFns.clear()

  const html = p.parseFromString(contents, "text/html")
  normalizeRelativeURLs(html, url)

  let title = html.querySelector("title")?.textContent
  if (title) {
    document.title = title
  } else {
    const h1 = document.querySelector("h1")
    title = h1?.innerText ?? h1?.textContent ?? url.pathname
  }
  if (announcer.textContent !== title) {
    announcer.textContent = title
  }
  announcer.dataset.persist = ""
  html.body.appendChild(announcer)

  // morph body
  micromorph(document.body, html.body)

  // scroll into place and add history
  if (!isBack) {
    if (url.hash) {
      const el = document.getElementById(decodeURIComponent(url.hash.substring(1)))
      el?.scrollIntoView()
    } else {
      window.scrollTo({ top: 0 })
    }
  }

  // now, patch head
  const elementsToRemove = document.head.querySelectorAll(":not([spa-preserve])")
  elementsToRemove.forEach((el) => el.remove())
  const elementsToAdd = html.head.querySelectorAll(":not([spa-preserve])")
  elementsToAdd.forEach((el) => document.head.appendChild(el))

  // delay setting the url until now
  // at this point everything is loaded so changing the url should resolve to the correct addresses
  if (!isBack) {
    history.pushState({}, "", url)
  }

  // Call the decryption function after navigation
  if (typeof window.quartzDecrypt === 'function') {
    window.quartzDecrypt();
  }

  notifyNav(getFullSlug(window))
  delete announcer.dataset.persist
}

window.spaNavigate = navigate

function createRouter() {
  if (typeof window !== "undefined") {
    window.addEventListener("click", async (event) => {
      const { url } = getOpts(event) ?? {}
      // dont hijack behaviour, just let browser act normally
      if (!url || event.ctrlKey || event.metaKey) return
      event.preventDefault()

      if (isSamePage(url) && url.hash) {
        const el = document.getElementById(decodeURIComponent(url.hash.substring(1)))
        el?.scrollIntoView()
        history.pushState({}, "", url)
        return
      }

      try {
        navigate(url, false)
      } catch (e) {
        window.location.assign(url)
      }
    })

    window.addEventListener("popstate", (event) => {
      const { url } = getOpts(event) ?? {}
      if (window.location.hash && window.location.pathname === url?.pathname) return
      try {
        navigate(new URL(window.location.toString()), true)
      } catch (e) {
        window.location.reload()
      }
      return
    })

    window.addEventListener("nav", () => {
      if (typeof window.quartzDecrypt === 'function') {
        window.quartzDecrypt();
      }
    })
  }

  return new (class Router {
    go(pathname: RelativeURL) {
      const url = new URL(pathname, window.location.toString())
      return navigate(url, false)
    }

    back() {
      return window.history.back()
    }

    forward() {
      return window.history.forward()
    }
  })()
}

function decryptContent() {
  // Try to get or regenerate the decryption password
  const password = authenticateAndGetPassword();
  if (!password) return;

  const articles = document.querySelectorAll('article.encrypted');
  articles.forEach(article => {
    const encryptedDiv = article.querySelector('.encrypted-content');
    const messageDiv = article.querySelector('.encrypted-message');
    if (!encryptedDiv || !messageDiv) return;
    
    try {
      const decrypted = CryptoJS.AES.decrypt(encryptedDiv.textContent!.trim(), password).toString(CryptoJS.enc.Utf8);
      if (decrypted) {
        article.innerHTML = decrypted;
        article.classList.remove('encrypted');
        article.classList.add('decrypted');
      }
    } catch (e) {
      console.error('Decryption failed for', article, e);
    }
  });
}

function getCookie(name: string) {
  const value = `; ${document.cookie}`;
  const parts = value.split(`; ${name}=`);
  if (parts.length === 2) return parts.pop()?.split(';').shift();
}

function setCookie(name: string, value: string, days?: number) {
  let expires = "";
  if (days) {
    const date = new Date();
    date.setTime(date.getTime() + (days * 24 * 60 * 60 * 1000));
    expires = "; expires=" + date.toUTCString();
  }
  document.cookie = name + "=" + encodeURIComponent(value) + expires + "; path=/";
}

function decryptMasterPassword(encryptedPassword: string, userPassword: string) {
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
  if (userPassword && window.encryptedMasterPasswords) {
    const userEntry = window.encryptedMasterPasswords.find(entry => userPassword.startsWith(entry.id));
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

// Assign the decryptContent function to window.quartzDecrypt
window.quartzDecrypt = decryptContent;

// Call decryptContent on initial load
document.addEventListener('DOMContentLoaded', decryptContent);

createRouter()
notifyNav(getFullSlug(window))

if (!customElements.get("route-announcer")) {
  const attrs = {
    "aria-live": "assertive",
    "aria-atomic": "true",
    style:
      "position: absolute; left: 0; top: 0; clip: rect(0 0 0 0); clip-path: inset(50%); overflow: hidden; white-space: nowrap; width: 1px; height: 1px",
  }

  customElements.define(
    "route-announcer",
    class RouteAnnouncer extends HTMLElement {
      constructor() {
        super()
      }
      connectedCallback() {
        for (const [key, value] of Object.entries(attrs)) {
          this.setAttribute(key, value)
        }
      }
    },
  )
}
