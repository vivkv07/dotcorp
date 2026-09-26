/* Ontology Studio — industry templates
   Each template describes an ontology: object types (with sample properties and an
   optional automation), the links between them, and the three source tiers.       */

const P = (label, value, status = "neutral") => ({ label, value, status });
const O = (id, name, icon, props, automation) => ({ id, name, icon, props, automation: automation || "" });
const L = (source, target, verb) => ({ source, target, verb });

const INDUSTRIES = {
  manufacturing: {
    name: "Manufacturing",
    icon: "factory",
    objects: [
      O("plant", "Plant", "factory", [
        P("Status", "Running", "ok"),
        P("Energy Consumption", "12000kWh", "info"),
        P("Cycle Time (Avg)", "45.2", "warn"),
        P("Issues", "17", "bad"),
        P("Plant Uptime", "99.98%", "ok"),
        P("Efficiency Score", "88", "ok"),
      ], "Flag Staff Shortage"),
      O("supplier", "Supplier", "truck", [
        P("Rating", "A", "ok"), P("Lead Time", "9 days", "info"), P("On-time Delivery", "94%", "ok"), P("Open POs", "12"),
      ]),
      O("machine", "Machine", "gear", [
        P("Model", "CNC-450"), P("State", "Idle", "warn"), P("OEE", "81%", "ok"), P("Vibration", "2.1 mm/s", "ok"), P("Next Maintenance", "4 days", "info"),
      ], "Predict Failure"),
      O("workorder", "Work Order", "clipboard", [
        P("Priority", "High", "bad"), P("Quantity", "1,200", "info"), P("Due In", "2d 4h", "warn"), P("Completion", "62%", "info"),
      ]),
      O("product", "Product", "box", [
        P("SKU", "DC-8841"), P("Unit Cost", "₹1,240", "info"), P("Defect Rate", "0.4%", "ok"), P("Stock", "8,900", "info"),
      ]),
      O("warehouse", "Warehouse", "warehouse", [
        P("Location", "Pune, IN"), P("Capacity Used", "76%", "warn"), P("SKUs", "4,310", "info"), P("Dock Status", "Open", "ok"),
      ], "Allocate Inventory"),
      O("order", "Order", "cart", [
        P("Value", "₹4.2L", "info"), P("Status", "In Fulfilment", "info"), P("Lines", "6"), P("Promised Date", "Oct 3", "warn"),
      ], "Schedule Delivery"),
      O("customer", "Customer", "person", [
        P("Segment", "Enterprise"), P("Lifetime Value", "₹86L", "ok"), P("NPS", "71", "ok"), P("Open Tickets", "2", "warn"),
      ], "Notify Customer"),
      O("shipment", "Shipment", "truck", [
        P("Carrier", "BlueDart"), P("ETA", "14:30", "info"), P("Temperature", "4.1°C", "ok"), P("Delay Risk", "Low", "ok"),
      ]),
      O("revenue", "Revenue", "chart", [
        P("MTD", "₹12.6Cr", "ok"), P("vs Plan", "+4.2%", "ok"), P("Margin", "31%", "info"), P("Backlog", "₹9.1Cr", "info"),
      ], "Update LTV Model"),
      O("forecast", "Forecast", "chartDashed", [
        P("Horizon", "12 wks"), P("Demand", "48,200", "info"), P("Confidence", "0.87", "ok"), P("Drift Flag", "None", "ok"),
      ], "Change Forecast"),
    ],
    links: [
      L("supplier", "plant", "Supplies"),
      L("plant", "machine", "Operates"),
      L("machine", "workorder", "Executes"),
      L("workorder", "product", "Produces"),
      L("plant", "warehouse", "Supplies"),
      L("product", "warehouse", "Stored in"),
      L("warehouse", "order", "Prepares"),
      L("customer", "order", "Places"),
      L("order", "shipment", "Ships"),
      L("order", "revenue", "Generates"),
      L("revenue", "forecast", "Updates"),
      L("forecast", "plant", "Plans"),
    ],
    sources: {
      data: ["Transactions", "IoT / Sensor", "Geospatial", "Unstructured", "Relational", "More..."],
      logic: ["Supervised ML", "Entity Resolution", "Unsupervised ML", "Optimizers", "Forecast Models", "Rule-based Logic"],
      action: ["ERP", "SCM", "MES", "Scheduling", "Edge", "More..."],
    },
  },

  retail: {
    name: "Retail",
    icon: "store",
    objects: [
      O("supplier", "Supplier", "truck", [P("Rating", "B+", "ok"), P("Lead Time", "14 days", "warn"), P("Fill Rate", "91%", "ok"), P("Open POs", "34")]),
      O("product", "Product", "tag", [P("SKU", "RT-20931"), P("Price", "₹2,499", "info"), P("Margin", "38%", "ok"), P("Rating", "4.6 ★", "ok")]),
      O("inventory", "Inventory", "box", [P("On Hand", "412", "info"), P("Reorder Point", "150"), P("Days of Cover", "9", "warn"), P("Shrinkage", "0.8%", "ok")], "Reorder Stock"),
      O("store", "Store", "store", [P("City", "Bengaluru"), P("Footfall (Today)", "3,120", "info"), P("Conversion", "24%", "ok"), P("Staff On Shift", "11")]),
      O("customer", "Customer", "person", [P("Loyalty Tier", "Gold", "ok"), P("Lifetime Value", "₹1.4L", "ok"), P("Last Visit", "3 days ago", "info"), P("Churn Risk", "Low", "ok")], "Send Offer"),
      O("promotion", "Promotion", "bolt", [P("Code", "FEST20"), P("Discount", "20%", "info"), P("Uplift", "+11%", "ok"), P("Ends In", "2 days", "warn")], "Adjust Discount"),
      O("order", "Order", "cart", [P("Value", "₹6,830", "info"), P("Channel", "App"), P("Status", "Packed", "info"), P("Promised", "Tomorrow", "ok")]),
      O("shipment", "Shipment", "truck", [P("Carrier", "Delhivery"), P("ETA", "Tomorrow 11:00", "info"), P("Stops Left", "4"), P("Delay Risk", "Medium", "warn")]),
      O("return", "Return", "undo", [P("Reason", "Size"), P("Refund", "₹1,299", "info"), P("Condition", "Resellable", "ok"), P("Status", "Pending", "warn")], "Approve Refund"),
      O("revenue", "Revenue", "chart", [P("Today", "₹48.2L", "ok"), P("vs LY", "+7.9%", "ok"), P("Basket Size", "₹1,870", "info"), P("Discount Rate", "12%", "warn")]),
    ],
    links: [
      L("supplier", "product", "Supplies"), L("product", "inventory", "Stocked as"), L("store", "inventory", "Holds"),
      L("customer", "order", "Places"), L("order", "product", "Contains"), L("store", "order", "Fulfils"),
      L("order", "shipment", "Ships"), L("promotion", "product", "Applies to"), L("order", "return", "Triggers"), L("order", "revenue", "Generates"),
    ],
    sources: {
      data: ["POS Transactions", "Web Clickstream", "Loyalty CRM", "Geospatial", "Product Catalog", "More..."],
      logic: ["Demand Forecasting", "Entity Resolution", "Price Optimization", "Recommendations", "Churn Model", "Rule-based Logic"],
      action: ["ERP", "POS", "OMS", "WMS", "Marketing Cloud", "More..."],
    },
  },

  banking: {
    name: "Banking",
    icon: "bank",
    objects: [
      O("customer", "Customer", "person", [P("Segment", "Affluent"), P("Relationship Value", "₹2.1Cr", "ok"), P("Products Held", "5", "info"), P("KYC Status", "Due", "warn")], "Trigger KYC Refresh"),
      O("account", "Account", "card", [P("Type", "Savings"), P("Balance", "₹8.4L", "info"), P("Last Activity", "2 hrs ago", "ok"), P("Dormancy Risk", "Low", "ok")], "Flag Dormancy"),
      O("card", "Card", "card", [P("Network", "Visa"), P("Limit Used", "43%", "info"), P("Status", "Active", "ok"), P("Intl. Enabled", "Yes")]),
      O("transaction", "Transaction", "coin", [P("Amount", "₹24,900", "info"), P("Channel", "UPI"), P("Merchant Category", "Travel"), P("Risk Score", "0.12", "ok")]),
      O("merchant", "Merchant", "store", [P("Name", "IndiGo"), P("MCC", "4511"), P("Chargeback Rate", "0.3%", "ok"), P("Country", "IN")]),
      O("fraud", "Fraud Alert", "bell", [P("Severity", "High", "bad"), P("Model", "GBM-v7"), P("Confidence", "0.93", "bad"), P("Status", "Open", "warn")], "Block Card"),
      O("loan", "Loan", "bank", [P("Product", "Home Loan"), P("Outstanding", "₹62L", "info"), P("Rate", "8.4%", "info"), P("DPD", "0", "ok")], "Re-price Loan"),
      O("risk", "Risk Score", "gauge", [P("Bureau Score", "782", "ok"), P("PD (12m)", "1.1%", "ok"), P("Model Version", "v3.2"), P("Refreshed", "Today", "info")]),
      O("branch", "Branch", "building", [P("City", "Mumbai"), P("RM Count", "14"), P("NPS", "64", "ok"), P("Wait Time", "9 min", "warn")]),
      O("kyc", "KYC Document", "document", [P("Type", "Aadhaar"), P("Verified", "Yes", "ok"), P("Expires", "2027-03"), P("Source", "DigiLocker")]),
    ],
    links: [
      L("customer", "account", "Owns"), L("account", "transaction", "Records"), L("card", "transaction", "Initiates"),
      L("customer", "card", "Holds"), L("customer", "loan", "Borrows"), L("branch", "customer", "Serves"),
      L("transaction", "merchant", "Paid to"), L("transaction", "fraud", "Raises"), L("customer", "kyc", "Verified by"), L("loan", "risk", "Scored by"),
    ],
    sources: {
      data: ["Core Banking", "Card Switch", "Payment Rails", "Credit Bureau", "Documents", "More..."],
      logic: ["Fraud Detection ML", "Entity Resolution", "Credit Scoring", "AML Rules", "Next-best Action", "Optimizers"],
      action: ["Core Banking", "CRM", "Card Management", "Loan Origination", "Case Management", "More..."],
    },
  },

  healthcare: {
    name: "Healthcare",
    icon: "hospital",
    objects: [
      O("patient", "Patient", "person", [P("Age", "58"), P("Risk Tier", "High", "bad"), P("Chronic Conditions", "2", "warn"), P("Last Visit", "12 days ago", "info")]),
      O("appointment", "Appointment", "calendar", [P("When", "Tue 10:30", "info"), P("Type", "Follow-up"), P("No-show Risk", "22%", "warn"), P("Status", "Confirmed", "ok")], "Send Reminder"),
      O("provider", "Provider", "person", [P("Specialty", "Cardiology"), P("Panel Size", "1,240", "info"), P("Utilisation", "88%", "ok"), P("Rating", "4.8 ★", "ok")]),
      O("encounter", "Encounter", "clipboard", [P("Setting", "Outpatient"), P("Duration", "24 min"), P("Acuity", "Moderate", "warn"), P("Coded", "Yes", "ok")]),
      O("diagnosis", "Diagnosis", "document", [P("ICD-10", "I10"), P("Description", "Hypertension"), P("Onset", "2021"), P("Controlled", "No", "bad")]),
      O("medication", "Medication", "pill", [P("Drug", "Amlodipine"), P("Dose", "5 mg"), P("Adherence", "71%", "warn"), P("Interactions", "None", "ok")], "Check Interactions"),
      O("lab", "Lab Result", "flask", [P("Test", "HbA1c"), P("Value", "7.9%", "bad"), P("Reference", "< 6.5%"), P("Resulted", "Today", "info")], "Alert Provider"),
      O("facility", "Facility", "hospital", [P("Name", "Apollo West"), P("Beds Available", "14", "ok"), P("ED Wait", "38 min", "warn"), P("Occupancy", "82%", "info")]),
      O("claim", "Claim", "document", [P("Amount", "₹18,400", "info"), P("Status", "Submitted", "info"), P("Denial Risk", "Low", "ok"), P("Payer", "Star Health")], "Auto-adjudicate"),
      O("plan", "Insurance Plan", "shield", [P("Plan", "Gold Family"), P("Deductible Met", "60%", "info"), P("Network", "In-network", "ok"), P("Renewal", "Mar 2027")]),
    ],
    links: [
      L("patient", "appointment", "Books"), L("appointment", "encounter", "Becomes"), L("provider", "encounter", "Conducts"),
      L("encounter", "diagnosis", "Yields"), L("encounter", "medication", "Prescribes"), L("encounter", "lab", "Orders"),
      L("facility", "encounter", "Hosts"), L("encounter", "claim", "Bills"), L("plan", "claim", "Covers"), L("patient", "plan", "Enrolled in"),
    ],
    sources: {
      data: ["EHR / FHIR", "Lab Systems", "Imaging", "Claims Feeds", "Wearables / IoT", "More..."],
      logic: ["Risk Stratification", "Entity Resolution", "Readmission Model", "Scheduling Optimizer", "Clinical Rules", "NLP on Notes"],
      action: ["EHR", "Practice Mgmt", "Pharmacy", "Billing / RCM", "Patient Portal", "More..."],
    },
  },

  logistics: {
    name: "Logistics",
    icon: "truck",
    objects: [
      O("customer", "Customer", "person", [P("Tier", "Key Account"), P("Monthly Volume", "12,400 pkgs", "info"), P("On-time Rate", "96%", "ok"), P("Open Claims", "3", "warn")]),
      O("shipment", "Shipment", "box", [P("AWB", "DC-77120391"), P("Service", "Express"), P("ETA", "Tomorrow 09:00", "info"), P("Delay Risk", "High", "bad")], "Predict Delay"),
      O("package", "Package", "box", [P("Weight", "4.2 kg"), P("Dimensions", "40×30×20"), P("Fragile", "Yes", "warn"), P("Last Scan", "Hub-BLR", "info")]),
      O("hub", "Hub", "warehouse", [P("Location", "Bengaluru"), P("Throughput", "48k / day", "info"), P("Backlog", "1,900", "warn"), P("Sorter Status", "Online", "ok")]),
      O("route", "Route", "pin", [P("Stops", "38"), P("Distance", "112 km"), P("Progress", "61%", "info"), P("Optimised", "Today 05:10", "ok")], "Re-optimize Route"),
      O("vehicle", "Vehicle", "truck", [P("Reg. No.", "KA 01 AB 4421"), P("Fuel Level", "38%", "warn"), P("Odometer", "182,400 km"), P("Service Due", "In 600 km", "warn")], "Schedule Maintenance"),
      O("driver", "Driver", "person", [P("Name", "R. Kumar"), P("Hours Today", "6.5 h", "info"), P("Safety Score", "92", "ok"), P("Status", "On Route", "ok")]),
      O("carrier", "Carrier", "building", [P("Name", "Partner Fleet A"), P("Fleet Size", "220"), P("SLA Compliance", "93%", "ok"), P("Cost / km", "₹18", "info")]),
      O("delivery", "Delivery Event", "calendar", [P("Type", "Delivered"), P("Time", "14:12", "info"), P("Proof", "Photo + OTP", "ok"), P("Exception", "None", "ok")], "Notify Customer"),
      O("invoice", "Invoice", "document", [P("Amount", "₹3.8L", "info"), P("Status", "Due", "warn"), P("Due Date", "Oct 15"), P("Disputed Lines", "0", "ok")]),
    ],
    links: [
      L("customer", "shipment", "Books"), L("shipment", "package", "Contains"), L("route", "shipment", "Carries"),
      L("vehicle", "route", "Runs"), L("driver", "vehicle", "Drives"), L("hub", "route", "Originates"),
      L("shipment", "delivery", "Produces"), L("carrier", "vehicle", "Operates"), L("shipment", "invoice", "Billed via"), L("hub", "package", "Sorts"),
    ],
    sources: {
      data: ["Telematics / GPS", "Scan Events", "Orders (EDI)", "Weather", "Geospatial", "More..."],
      logic: ["Route Optimizer", "ETA Prediction", "Entity Resolution", "Load Planning", "Anomaly Detection", "Rule-based Logic"],
      action: ["TMS", "WMS", "Fleet Mgmt", "Dispatch", "Customer Portal", "More..."],
    },
  },

  energy: {
    name: "Energy",
    icon: "bolt",
    objects: [
      O("grid", "Grid Segment", "bolt", [P("Region", "North Zone"), P("Load", "412 MW", "info"), P("Peak Forecast", "480 MW", "warn"), P("Reliability (SAIDI)", "0.9 h", "ok")]),
      O("substation", "Substation", "server", [P("Voltage", "132 kV"), P("Transformers", "4"), P("Load Factor", "78%", "info"), P("Status", "Normal", "ok")]),
      O("asset", "Asset", "gear", [P("Type", "Transformer T2"), P("Age", "18 yrs", "warn"), P("Health Index", "62", "warn"), P("Failure Prob. (90d)", "7%", "bad")], "Predict Failure"),
      O("reading", "Sensor Reading", "gauge", [P("Oil Temp", "84°C", "warn"), P("Dissolved Gas", "Elevated", "bad"), P("Sampled", "5 min ago", "info"), P("Quality", "Good", "ok")]),
      O("outage", "Outage", "bell", [P("Customers Affected", "3,200", "bad"), P("Cause", "Equipment"), P("Started", "11:42", "info"), P("ETR", "14:00", "warn")], "Dispatch Crew"),
      O("workorder", "Work Order", "clipboard", [P("Priority", "P1", "bad"), P("Crew", "Crew 7"), P("Status", "En Route", "info"), P("Parts Ready", "Yes", "ok")]),
      O("technician", "Technician", "wrench", [P("Name", "S. Iyer"), P("Certifications", "HV, Live-line"), P("Location", "6 km away", "info"), P("Shift Ends", "18:00")]),
      O("customer", "Customer", "person", [P("Class", "Commercial"), P("Avg. Usage", "9,200 kWh", "info"), P("Solar", "Yes", "ok"), P("Outage Notified", "Yes", "ok")]),
      O("meter", "Meter", "gauge", [P("Type", "Smart AMI"), P("Last Read", "15 min ago", "ok"), P("Tamper Flag", "No", "ok"), P("Tariff", "ToU-C")], "Adjust Tariff"),
      O("bill", "Bill", "document", [P("Amount", "₹1.2L", "info"), P("Anomaly", "+34% vs avg", "warn"), P("Due", "Oct 20"), P("Status", "Issued", "info")], "Flag Anomaly"),
    ],
    links: [
      L("grid", "substation", "Contains"), L("substation", "asset", "Houses"), L("asset", "reading", "Emits"),
      L("reading", "outage", "Predicts"), L("outage", "workorder", "Creates"), L("technician", "workorder", "Executes"),
      L("customer", "meter", "Has"), L("meter", "bill", "Generates"), L("grid", "customer", "Serves"), L("outage", "customer", "Affects"),
    ],
    sources: {
      data: ["SCADA", "Smart Meters (AMI)", "IoT / Sensor", "GIS", "Weather", "More..."],
      logic: ["Load Forecasting", "Predictive Maintenance", "Entity Resolution", "Optimizers", "Anomaly Detection", "Rule-based Logic"],
      action: ["OMS", "EAM", "Billing", "Workforce Mgmt", "DERMS", "More..."],
    },
  },

  insurance: {
    name: "Insurance",
    icon: "shield",
    objects: [
      O("policyholder", "Policyholder", "person", [P("Tenure", "6 yrs"), P("Policies", "3", "info"), P("Claims (5y)", "1", "ok"), P("Renewal Risk", "Medium", "warn")]),
      O("policy", "Policy", "document", [P("Line", "Motor"), P("Premium", "₹18,400", "info"), P("Renews", "Nov 12", "warn"), P("Status", "Active", "ok")], "Renewal Offer"),
      O("coverage", "Coverage", "shield", [P("Type", "Comprehensive"), P("Sum Insured", "₹9.5L", "info"), P("Deductible", "₹2,000"), P("Add-ons", "Zero Dep, RSA")]),
      O("asset", "Insured Asset", "truck", [P("Vehicle", "Tata Nexon EV"), P("Year", "2024"), P("IDV", "₹9.5L", "info"), P("Telematics", "Enabled", "ok")]),
      O("incident", "Incident", "bell", [P("Type", "Collision"), P("Reported", "2 hrs ago", "info"), P("Severity", "Moderate", "warn"), P("Fraud Score", "0.08", "ok")], "Detect Fraud"),
      O("claim", "Claim", "clipboard", [P("Reserve", "₹1.4L", "info"), P("Status", "Assessment", "info"), P("Cycle Time", "3 days", "ok"), P("Straight-through", "Eligible", "ok")], "Fast-track Claim"),
      O("adjuster", "Adjuster", "person", [P("Name", "M. Rao"), P("Open Claims", "23", "warn"), P("Avg. Cycle", "4.1 days", "ok"), P("Region", "South")]),
      O("repair", "Repair Shop", "wrench", [P("Name", "AutoFix Koramangala"), P("Network", "Preferred", "ok"), P("Est. Cost", "₹92,000", "info"), P("Turnaround", "5 days")]),
      O("payment", "Payment", "coin", [P("Amount", "₹88,500", "info"), P("Mode", "NEFT"), P("Approval", "Pending", "warn"), P("Payee", "Repair Shop")], "Auto-approve"),
      O("riskmodel", "Risk Model", "gauge", [P("Model", "Motor-Pricing v9"), P("Loss Ratio Pred.", "64%", "info"), P("Confidence", "0.9", "ok"), P("Last Trained", "Sep 1")]),
    ],
    links: [
      L("policyholder", "policy", "Holds"), L("policy", "coverage", "Includes"), L("policy", "asset", "Insures"),
      L("asset", "incident", "Involved in"), L("incident", "claim", "Files"), L("adjuster", "claim", "Handles"),
      L("claim", "repair", "Assigned to"), L("claim", "payment", "Settles"), L("riskmodel", "policy", "Prices"), L("policyholder", "claim", "Reports"),
    ],
    sources: {
      data: ["Policy Admin", "Claims Feeds", "Telematics", "Weather / Cat Data", "Documents", "More..."],
      logic: ["Fraud Detection", "Severity Model", "Entity Resolution", "Pricing Optimizer", "Rules Engine", "Document AI"],
      action: ["Policy Admin", "Claims System", "CRM", "Payments", "Partner Portal", "More..."],
    },
  },

  saas: {
    name: "SaaS",
    icon: "server",
    objects: [
      O("account", "Account", "building", [P("Plan", "Enterprise"), P("ARR", "$240k", "ok"), P("Health Score", "58", "warn"), P("Renewal", "Dec 1", "info")], "Flag Churn Risk"),
      O("user", "User", "person", [P("Role", "Admin"), P("Last Active", "Today", "ok"), P("Seats Used", "42 / 50", "info"), P("Activation", "Complete", "ok")]),
      O("subscription", "Subscription", "refresh", [P("Term", "Annual"), P("MRR", "$20k", "info"), P("Add-ons", "2"), P("Expansion Signal", "Yes", "ok")], "Upsell Nudge"),
      O("plan", "Plan", "document", [P("Name", "Enterprise"), P("Seat Price", "$48", "info"), P("SLA", "99.9%", "ok"), P("Support", "Premium")]),
      O("feature", "Feature", "bolt", [P("Name", "Workflows"), P("Adoption", "63%", "info"), P("Flag State", "GA", "ok"), P("Weekly Active", "1,240", "info")]),
      O("usage", "Usage Event", "chart", [P("Event", "workflow.run"), P("Count (7d)", "18,900", "info"), P("Trend", "+12%", "ok"), P("Errors", "0.3%", "ok")]),
      O("ticket", "Support Ticket", "chat", [P("Priority", "P2", "warn"), P("Age", "6 hrs", "warn"), P("Sentiment", "Negative", "bad"), P("Owner", "Unassigned", "bad")], "Route to Team"),
      O("invoice", "Invoice", "document", [P("Amount", "$20,000", "info"), P("Status", "Overdue 8d", "bad"), P("Method", "ACH"), P("Retries", "2", "warn")], "Dunning Sequence"),
      O("deal", "Deal", "coin", [P("Stage", "Negotiation", "info"), P("Value", "$96k", "ok"), P("Close Date", "Oct 30"), P("Win Probability", "68%", "ok")]),
      O("rep", "Sales Rep", "person", [P("Name", "A. Mehta"), P("Quota Attainment", "112%", "ok"), P("Open Pipeline", "$1.1M", "info"), P("Territory", "APAC")]),
    ],
    links: [
      L("account", "user", "Has"), L("account", "subscription", "Subscribes"), L("subscription", "plan", "On"),
      L("subscription", "invoice", "Bills"), L("plan", "feature", "Includes"), L("user", "usage", "Generates"),
      L("usage", "feature", "Uses"), L("user", "ticket", "Raises"), L("deal", "account", "Converts to"), L("rep", "deal", "Owns"),
    ],
    sources: {
      data: ["Product Events", "CRM", "Billing", "Support Desk", "Web Analytics", "More..."],
      logic: ["Churn Model", "Health Scoring", "Entity Resolution", "Lead Scoring", "Anomaly Detection", "Rule-based Logic"],
      action: ["CRM", "Billing System", "Help Desk", "Marketing Automation", "Feature Flags", "More..."],
    },
  },
};

const INDUSTRY_ORDER = ["manufacturing", "retail", "banking", "healthcare", "logistics", "energy", "insurance", "saas"];

/* Line-art icons (24×24, stroke based). Each entry is inner SVG markup. */
const ICONS = {
  factory: '<path d="M3 20V9l5 3V9l5 3V9l5 3V5h3v15Z"/><path d="M6 16h2M11 16h2M16 16h2"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1"/>',
  clipboard: '<path d="M8 4h8v3H8Z"/><path d="M6 6h12v15H6Z"/><path d="M9 12h6M9 16h4"/>',
  warehouse: '<path d="M3 21V9l9-5 9 5v12"/><path d="M7 21v-8h10v8"/><path d="M3 21h18M12 13v8"/>',
  truck: '<path d="M2 7h11v9H2Z"/><path d="M13 10h4l3 3v3h-7"/><circle cx="6" cy="17" r="1.6"/><circle cx="17" cy="17" r="1.6"/>',
  box: '<path d="M12 3l8 4.5v9L12 21l-8-4.5v-9Z"/><path d="M4 7.5l8 4.5 8-4.5M12 12v9"/>',
  cart: '<path d="M3 4h2l2.5 11h11L21 7H6"/><circle cx="9" cy="19" r="1.4"/><circle cx="17" cy="19" r="1.4"/>',
  person: '<circle cx="12" cy="8" r="3.5"/><path d="M5 20c0-3.5 3-6 7-6s7 2.5 7 6"/>',
  chart: '<path d="M3 20h18M3 20V4"/><path d="M6 15l4-5 4 3 5-7"/><circle cx="10" cy="10" r="1"/><circle cx="14" cy="13" r="1"/>',
  chartDashed: '<path d="M3 20h18M3 20V4"/><path d="M6 15l4-5 4 3 5-7" stroke-dasharray="2 2"/>',
  store: '<path d="M3 9l2-5h14l2 5"/><path d="M3 9a3 3 0 0 0 6 0 3 3 0 0 0 6 0 3 3 0 0 0 6 0"/><path d="M5 12v8h14v-8M10 20v-5h4v5"/>',
  tag: '<path d="M3 3h8l10 10-8 8L3 11Z"/><circle cx="7" cy="7" r="1.5"/>',
  undo: '<path d="M9 14L4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/>',
  card: '<rect x="3" y="6" width="18" height="12" rx="2"/><path d="M3 10h18M7 15h4"/>',
  coin: '<circle cx="12" cy="12" r="9"/><path d="M12 7v10M9.5 9.5h3.5a1.5 1.5 0 0 1 0 3h-2a1.5 1.5 0 0 0 0 3H15"/>',
  building: '<rect x="5" y="3" width="14" height="18"/><path d="M9 7h2M13 7h2M9 11h2M13 11h2M9 15h2M13 15h2M10 21v-3h4v3"/>',
  bell: '<path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4Z"/><path d="M10 20a2 2 0 0 0 4 0"/>',
  document: '<path d="M6 3h8l4 4v14H6Z"/><path d="M14 3v4h4M9 12h6M9 16h6"/>',
  gauge: '<path d="M4 18a8 8 0 1 1 16 0"/><path d="M12 18l4-6"/><circle cx="12" cy="18" r="1.5"/>',
  calendar: '<rect x="4" y="5" width="16" height="16" rx="2"/><path d="M4 10h16M8 3v4M16 3v4"/>',
  pill: '<path d="M6.5 6.5a4 4 0 0 1 5.7 0l5.3 5.3a4 4 0 0 1-5.7 5.7l-5.3-5.3a4 4 0 0 1 0-5.7Z"/><path d="M9.3 9.3l5.4 5.4"/>',
  flask: '<path d="M10 3h4M11 3v6L5 20h14l-6-11V3"/><path d="M8 15h8"/>',
  hospital: '<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M12 8v8M8 12h8"/>',
  shield: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6Z"/><path d="M9 12l2 2 4-4"/>',
  pin: '<path d="M12 21s-6-6-6-11a6 6 0 0 1 12 0c0 5-6 11-6 11Z"/><circle cx="12" cy="10" r="2"/>',
  bolt: '<path d="M13 2L4 14h7l-1 8 9-12h-7Z"/>',
  server: '<rect x="4" y="4" width="16" height="6" rx="1"/><rect x="4" y="14" width="16" height="6" rx="1"/><circle cx="8" cy="7" r=".8"/><circle cx="8" cy="17" r=".8"/>',
  wrench: '<path d="M14 4a5 5 0 0 0-4.6 7L3 17.4 6.6 21l6.4-6.4A5 5 0 0 0 20 10l-3 1-2-2 1-3Z"/>',
  chat: '<path d="M4 4h16v11H9l-5 4Z"/><path d="M8 8h8M8 11h5"/>',
  refresh: '<path d="M20 12a8 8 0 1 1-2.3-5.7"/><path d="M20 3v5h-5"/>',
  bank: '<path d="M3 9l9-5 9 5"/><path d="M5 9v9M9 9v9M15 9v9M19 9v9M3 21h18"/>',
};
