# CBROS Genuine Autoparts & Accessories

---

## MEMORANDUM

**Para sa:** Lahat ng Staff — Cashiers, Warehouse Team, Service Advisors, Mechanics
**Mula sa:** Management & ERP Implementation Team
**Petsa:** March 2026
**Tungkol sa:** Welcome sa APEX POS — User Acceptance Testing (UAT) Sandbox

---

### Welcome & Bakit Tayo Nandito

Team,

Ready na ang bago nating system — **APEX POS** — at kayo na ang susunod na gagamit.

Simula ngayong week, bibigyan kayo ng access sa isang **UAT Sandbox**. Ito ay isang safe na test copy ng bagong system. Puro test data lang ang nasa loob — hindi totoong inventory, hindi totoong customers, hindi totoong transactions. Kahit ano ang gawin niyo dito, walang masisira.

Hindi namin kayo pinapag-ingat. Gusto namin **subukan niyong sirain ang system.**

I-click niyo lahat ng buttons. Mag-search ng kung ano-anong SKU. Subukan niyo mag-checkout na walang stock. I-type niyo ang pinaka-mahabang vehicle plate number na naisip niyo. Gawin niyo kung ano ang ginagawa niyo every Saturday afternoon na puno ang shop at limang customer ang naghihintay.

Kung may naramdaman kayong mabagal, nakakalito, o mali — yun ang kailangan namin marinig. Bawat issue na makikita niyo ngayon, isang problema na hindi na lalabas sa Go-Live day.

Wala kaming kapalit sa experience niyo sa floor. Walang technical review ang kayang tumbasan ng instinct ng cashier na nag-process ng 50 sales sa isang araw, o ng warehouse staff na nag-receive ng tatlong delivery bago mag-lunch.

Salamat sa tulong niyo.

---

### Ano ang I-Te-Test

Mag-focus kayo sa mga ginagawa niyo araw-araw:

| Workflow | Ano ang Subukan |
|----------|-----------------|
| **Retail Sales** | Mag-search ng product gamit ang pangalan o mnemonic code. Gumawa ng cart. I-attach ang customer at sasakyan niya. I-complete ang sale. Subukan mag-void. |
| **Inventory Search** | Tignan ang stock levels sa location niyo. Mag-search by SKU. I-check kung tama pa ang quantity pagkatapos ng sale. |
| **Receiving ng Deliveries** | Mag-open ng Purchase Order. I-receive ang goods — accept ilan, reject ilan. I-verify na tumaas ang stock levels. |
| **Location Transfers** | Gumawa ng transfer mula Warehouse papuntang Store. I-approve, i-pick, i-dispatch, at i-receive sa destination. |
| **Job Cards** | Gumawa ng job card para sa isang sasakyan. Gumawa ng estimate na may labor at parts. I-approve. I-issue ang parts. I-complete at i-invoice ang job. |

Hindi niyo kailangang i-test lahat. **I-focus muna sa mga ginagawa niyo sa role niyo**, tapos explore na lang kung may time pa.

---

### UAT Mindset per Role

**Cashiers** — Tanong niyo sa sarili niyo: *"Mabilis ba akong maka-search at safe ba ang checkout?"*

- Makikita ba ang product sa loob ng 5 seconds gamit ang mnemonic code?
- Tama ba ang compute ng cart total kapag maraming items?
- Ano ang mangyayari kapag sinubukan mong i-sell ang mas marami sa actual stock?
- Smooth ba ang pag-attach ng walk-in customer at ng sasakyan niya?
- Pagkatapos ng sale, may lumabas bang tamang sale number?

**Warehouse Staff** — Tanong niyo sa sarili niyo: *"Tama ba ang receive at transfer ng stock ko?"*

- Kapag nag-receive kayo ng delivery laban sa PO, tumaas ba ang stock sa tamang quantity?
- Kung nag-reject kayo ng 2 out of 20 items, nag-record ba ang system ng 18 accepted at 2 rejected?
- Kapag nag-dispatch kayo ng transfer, umalis ba ang stock sa location niyo at dumating sa destination?
- May nakita ba kayong missing product o maling quantity pagkatapos ng transfer?

**Service Advisors** — Tanong niyo sa sarili niyo: *"Madali ba akong makagawa ng estimates?"*

- Nagawa ba ang job card, na-attach ang tamang customer at sasakyan, at na-record ang odometer?
- Madali bang mag-add ng labor lines (service operations) at parts sa estimate?
- Ang estimate total ba, tama para sa i-quote niyo sa customer?
- Smooth ba ang pag-approve ng estimate at pag-move ng job card sa mga susunod na stages?

**Mechanics** — Tanong niyo sa sarili niyo: *"Malinaw ba ang pag-issue at return ng parts?"*

- Kapag na-issue ang parts sa job card niyo, bumaba ba ang inventory nang tama?
- Kung kailangan niyo ng extra parts sa gitna ng trabaho, madali bang i-update ang quantity?
- Kung hindi niyo nagamit ang isang part, ma-return ba at babalik ang stock?
- Malinaw ba sa parts list kung ano na ang na-issue vs. kung ano pa lang ang planned?

---

### Paano Mag-Report ng Issues

Kapag may nakita kayo — at siguradong may makikita kayo — sabihin niyo sa amin:

| Detail | Halimbawa |
|--------|-----------|
| **Anong screen ang nasa harap mo?** | "Nasa POS page ako, nagse-search ng product." |
| **Ano ang sinubukan mong gawin?** | "Ni-type ko ang mnemonic code na AKINGSCOBR tapos pinindot ko ang Enter." |
| **Ano ang nangyari?** | "Wala lumabas. Walang result ang search." |
| **Ano ang expected mong mangyari?** | "Dapat lumabas ang product para ma-add ko sa cart." |

Isulat niyo sa papel, i-send sa group chat, o sabihin niyo na lang directly sa supervisor niyo. Kahit anong format okay lang.

**Walang tangang report.** Kung may button na mukhang mali, may label na mali ang spelling, o may screen na ang tagal mag-load — sabihin niyo. Ang maliliit na bagay, importante din. Gusto naming ayusin ang lahat bago Go-Live, hindi pagkatapos.

---

### Importanteng Paalala

> **Ang UAT Sandbox ay HINDI ang live system.**
>
> Lahat ng data sa Sandbox ay test data lang. Ang mga sales na gagawin niyo, ang mga stock na ire-receive niyo, at ang mga job cards na gagawin niyo — practice lang lahat. Wala sa mga ito ang dadalhin sa totoong system.
>
> Huwag gagamitin ang Sandbox para sa totoong customer transactions, totoong deliveries, o totoong job cards. Ituloy ang kasalukuyang process natin para sa lahat ng totoong business hanggang mag-announce ang management ng Go-Live.

---

### Login Details

| | |
|---|---|
| **URL:** | *(nakapost sa whiteboard / ibigay ng supervisor niyo)* |
| **Username niyo:** | *(ang assigned email niyo — tanungin ang supervisor)* |
| **Password niyo:** | *(ang assigned temporary password niyo — palitan sa first login)* |
| **Test Location:** | Piliin ang assigned store o warehouse niyo kapag tinanong |

---

Salamat sa oras at effort niyo. Ang system na ito, para sa inyo ginawa — ang feedback niyo ang magpapaganda nito.

**— Management & ERP Implementation Team**
**CBROS Genuine Autoparts & Accessories**

---

*Internal document ito para sa UAT purposes lang. Ref: SOP-UAT-001*
