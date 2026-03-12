# CBROS Genuine Autoparts & Accessories

---

## MEMORANDUM

**To:** All Staff — Cashiers, Warehouse Team, Service Advisors, Mechanics
**From:** Management & ERP Implementation Team
**Date:** March 2026
**Re:** Welcome to the APEX POS — User Acceptance Testing (UAT) Sandbox

---

### Welcome & Purpose

Team,

We are proud to announce that our new system — **APEX POS** — is ready for you to test.

Starting this week, you will have access to a **UAT Sandbox**. This is a safe, isolated copy of our new system loaded with test data. Nothing you do in the Sandbox will affect our real inventory, real customers, or real transactions. It is impossible to cause damage here.

We are not asking you to be careful. We are asking you to **try to break it.**

Click every button. Search for strange SKUs. Try checking out with zero stock. Enter a vehicle plate number with special characters. Do the things you would do on a busy Saturday afternoon when five customers are waiting.

If something feels slow, confusing, or wrong — that is exactly what we need to know. Every issue you find now is one less problem on Go-Live day.

Your experience on the shop floor is the most valuable test we have. No amount of technical review can replace the instincts of someone who processes 50 sales a day or receives 3 deliveries before lunch.

Thank you for being part of this.

---

### What to Test

Please focus on the workflows you use every day:

| Workflow | What to Try |
|----------|-------------|
| **Retail Sales** | Search products by name and mnemonic code. Build a cart. Attach a customer and vehicle. Complete the sale. Try a void. |
| **Inventory Search** | Look up stock levels at your location. Search by SKU. Confirm quantities make sense after a sale. |
| **Receiving Deliveries** | Open a Purchase Order. Receive goods — accept some, reject some. Verify stock levels increase. |
| **Location Transfers** | Create a transfer from Warehouse to a Store. Approve, pick, dispatch, and receive it at the destination. |
| **Job Cards** | Create a job card for a vehicle. Build an estimate with labor and parts. Approve it. Issue parts. Complete and invoice the job. |

You do not need to test every workflow. Focus on **your role's daily tasks** first, then explore if you have time.

---

### UAT Mindset by Role

**Cashiers** — Your Question: *"Can I search quickly and check out safely?"*

- Can you find a product in under 5 seconds using the mnemonic code?
- Does the cart total calculate correctly when you add multiple items?
- What happens if you try to sell more than what's in stock?
- Can you attach a walk-in customer and their vehicle smoothly?
- Does the completed sale show the correct sale number?

**Warehouse Staff** — Your Question: *"Can I receive and transfer stock correctly?"*

- When you receive a delivery against a PO, does the stock level go up by the right amount?
- If you reject 2 out of 20 items, does the system record 18 accepted and 2 rejected?
- When you dispatch a transfer, does stock leave your location and arrive at the destination?
- Can you spot any missing products or wrong quantities after a transfer?

**Service Advisors** — Your Question: *"Can I build estimates easily?"*

- Can you create a job card, attach the right customer and vehicle, and record the odometer?
- Is it easy to add labor lines (service operations) and parts to the estimate?
- Does the estimate total match what you'd quote the customer?
- Can you approve the estimate and move the job card through its stages smoothly?

**Mechanics** — Your Question: *"Can I issue and return parts without confusion?"*

- When parts are issued to your job card, does the inventory go down correctly?
- If you need extra parts mid-job, can you update the quantity easily?
- If you don't use a part, can you return it and see the stock go back up?
- Is the parts list on the job card clear about what's been issued vs. what's planned?

---

### How to Report Issues

When you find something — and you will — please tell us:

| Detail | Example |
|--------|---------|
| **Which screen were you on?** | "I was on the POS page, searching for a product." |
| **What did you try to do?** | "I typed the mnemonic code AKINGSCOBR and pressed Enter." |
| **What actually happened?** | "Nothing came up. The search just stayed empty." |
| **What did you expect to happen?** | "I expected the product to appear so I could add it to the cart." |

Write this on paper, send it via group chat, or tell your supervisor directly. Any format is fine.

**There are no stupid reports.** If a button looks odd, a label is misspelled, or a screen takes too long to load — tell us. Small things matter. We want to fix everything before Go-Live, not after.

---

### Important Reminder

> **The UAT Sandbox is NOT the live system.**
>
> All data in the Sandbox is test data. The sales you create, the stock you receive, and the job cards you build are all practice. None of it will carry over to our real system.
>
> Do not use the Sandbox to record actual customer transactions, actual deliveries, or actual job cards. Continue using our current process for all real business until management announces Go-Live.

---

### Login Details

| | |
|---|---|
| **URL:** | *(posted on the whiteboard / provided by your supervisor)* |
| **Your Username:** | *(your assigned email — see your supervisor)* |
| **Your Password:** | *(your assigned temporary password — change it on first login)* |
| **Test Location:** | Select your assigned store or warehouse when prompted |

---

Thank you for your time and effort. The system is built for you — your feedback makes it better.

**— Management & ERP Implementation Team**
**CBROS Genuine Autoparts & Accessories**

---

*This is an internal document for UAT purposes only. Ref: SOP-UAT-001*
