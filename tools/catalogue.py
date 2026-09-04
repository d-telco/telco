"""D-TELCO catalogue definition.

The single source of the 245 products, their variants, their relations and their bundles.
Nothing about the catalogue is written by hand anywhere else: the seed SQL, the two Dengage
upload CSVs and the JSON feed the site and the app read are all emitted from this file.

Prices are USD, per decision 5. Where a figure is published it is kept and the
same numeral is shown in dollars (GO 11.99 is $11.99 per 28 days). Everything else is a
plausible demo figure and carries demo_data True, which the emitters turn into a demo-data tag
so a panel viewer can tell the two apart without asking.

Counts: 241 active products, plus 4 archived tariffs so the archive page has real data.
"""

PUBLISHED = False   # readability alias: demo_data flag value for a published figure
DEMO = True

BRAND = "D·TELCO"
STORE_SHOP = "D·TELCO Shop"     # devices and accessories
STORE_MAIN = "D·TELCO"          # everything else

UNLIMITED = 99999               # the site renders anything >= this as Unlimited

# ----------------------------------------------------------------------------------------
# Plans
# ----------------------------------------------------------------------------------------
# (slug, title, price, data_gb, social_gb, ai_gb, minutes, sms, days, ussd, demo)
# GO 11.99, 17.99 and 29.99 are published figures and are not demo figures.
GO = [
    ("go-3-99",  "GO 3.99",  3.99,   1.5, 0,   1, 100,  50,  28, "*903#", DEMO),
    ("go-7-99",  "GO 7.99",  7.99,   3,   0,   1, 200,  100, 28, "*907#", DEMO),
    ("go-11-99", "GO 11.99", 11.99,  5,   0,   1, 300,  150, 28, "*905#", PUBLISHED),
    ("go-17-99", "GO 17.99", 17.99, 10,   1,   1, 600,  300, 28, "*910#", PUBLISHED),
    ("go-29-99", "GO 29.99", 29.99, 25,   3,   1, 1500, 500, 28, "*925#", PUBLISHED),
    ("go-59-99", "GO 59.99", 59.99, 60,   5,   1, 3000, 1000, 28, "*959#", DEMO),
    ("go-89-99", "GO 89.99", 89.99, 120, 10,   1, UNLIMITED, 2000, 28, "*989#", DEMO),
]
GO_PRO = [
    ("go-pro-19-99", "GO Pro 19.99", 19.99, 15,  2, 2, 800,  400, 28, "*919#", DEMO),
    ("go-pro-34-99", "GO Pro 34.99", 34.99, 35,  5, 2, 2000, 600, 28, "*934#", DEMO),
    ("go-pro-49-99", "GO Pro 49.99", 49.99, 70,  8, 3, 4000, 1000, 28, "*949#", DEMO),
    ("go-pro-79-99", "GO Pro 79.99", 79.99, 150, 15, 5, UNLIMITED, UNLIMITED, 28, "*979#", DEMO),
]
STAR = [
    ("star-3gb", "Star 3 GB",  5.99, 3, 0, 0, 150, 75,  30, "*803#", DEMO),
    ("star-5gb", "Star 5 GB",  8.99, 5, 0, 0, 250, 125, 30, "*805#", DEMO),
    ("star-7gb", "Star 7 GB", 11.99, 7, 1, 0, 350, 175, 30, "*807#", DEMO),
    ("star-9gb", "Star 9 GB", 14.99, 9, 1, 0, 450, 225, 30, "*809#", DEMO),
]
STAR_PRO = [
    ("star-pro-17gb", "Star Pro 17 GB", 19.99, 17, 2, 1, 600,  300, 30, "*817#", DEMO),
    ("star-pro-27gb", "Star Pro 27 GB", 27.99, 27, 3, 1, 900,  450, 30, "*827#", DEMO),
    ("star-pro-40gb", "Star Pro 40 GB", 37.99, 40, 4, 1, 1200, 600, 30, "*840#", DEMO),
    ("star-pro-60gb", "Star Pro 60 GB", 49.99, 60, 6, 2, 2000, 800, 30, "*860#", DEMO),
    ("star-pro-80gb", "Star Pro 80 GB", 64.99, 80, 8, 2, 3000, 1000, 30, "*880#", DEMO),
]
# Klass names carry their own numeral, which is the published price.
KLASS_PREPAID = [
    ("klass-8",  "Klass 8",   8, 4,  0, 1, 200,  100, 30, "*708#", PUBLISHED),
    ("klass-13", "Klass 13", 13, 8,  1, 1, 400,  200, 30, "*713#", PUBLISHED),
    ("klass-19", "Klass 19", 19, 15, 2, 1, 800,  400, 30, "*719#", PUBLISHED),
    ("klass-31", "Klass 31", 31, 30, 3, 1, 1600, 600, 30, "*731#", PUBLISHED),
    ("klass-55", "Klass 55", 55, 70, 6, 2, UNLIMITED, 1000, 30, "*755#", PUBLISHED),
]
KLASS_POSTPAID = [
    ("klass-8-postpaid",  "Klass 8 Postpaid",   8, 5,  0, 1, 250,  120, 30, PUBLISHED),
    ("klass-13-postpaid", "Klass 13 Postpaid", 13, 10, 1, 1, 500,  250, 30, PUBLISHED),
    ("klass-19-postpaid", "Klass 19 Postpaid", 19, 18, 2, 1, 900,  450, 30, PUBLISHED),
    ("klass-31-postpaid", "Klass 31 Postpaid", 31, 35, 3, 1, 1800, 700, 30, PUBLISHED),
    ("klass-50-postpaid", "Klass 50 Postpaid", 50, 60, 5, 2, 3000, 900, 30, PUBLISHED),
    ("klass-55-postpaid", "Klass 55 Postpaid", 55, 80, 6, 2, UNLIMITED, 1200, 30, PUBLISHED),
]
ARCHIVE = [
    ("archive-sade",        "Sade",         4.99, 1,  0, 0, 60,  30, 30, "*601#"),
    ("archive-ilk",         "Ilk",          6.99, 2,  0, 0, 120, 60, 30, "*602#"),
    ("archive-birinci",     "Birinci",      9.99, 4,  0, 0, 240, 120, 30, "*603#"),
    ("archive-daimonline", "DaimOnline",   12.99, 6,  0, 0, 300, 150, 30, "*604#"),
]

# ----------------------------------------------------------------------------------------
# Internet, add-ons and services
# ----------------------------------------------------------------------------------------
# (slug, title, price, data_gb, days, category leaf)
INTERNET_DAILY = [
    ("net-500mb-1d", "500 MB daily",       0.79, 0.5, 1),
    ("net-1gb-1d",   "1 GB daily",         1.29, 1,   1),
    ("net-2gb-1d",   "2 GB daily",         1.99, 2,   1),
    ("net-night-1d", "Unlimited night",    0.99, None, 1),
]
INTERNET_WEEKLY = [
    ("net-1gb-7d",  "1 GB weekly",   2.49, 1,  7),
    ("net-3gb-7d",  "3 GB weekly",   4.49, 3,  7),
    ("net-5gb-7d",  "5 GB weekly",   5.99, 5,  7),
    ("net-10gb-7d", "10 GB weekly",  8.99, 10, 7),
]
INTERNET_MONTHLY = [
    ("net-500mb-28d", "500 MB monthly",  1.99, 0.5, 28),
    ("net-1gb-28d",   "1 GB monthly",    3.49, 1,   28),
    ("net-3gb-28d",   "3 GB monthly",    6.49, 3,   28),
    ("net-5gb-28d",   "5 GB monthly",    8.99, 5,   28),
    ("net-10gb-28d",  "10 GB monthly",  12.99, 10,  28),
    ("net-20gb-28d",  "20 GB monthly",  18.99, 20,  28),
]
# (slug, title, price, speed_mbps)
INTERNET_UNLIMITED = [
    ("net-unlimited-5",   "Unlimited 5 Mbps",   19.99, 5),
    ("net-unlimited-20",  "Unlimited 20 Mbps",  29.99, 20),
    ("net-unlimited-max", "Unlimited full speed", 39.99, 100),
]
# (slug, title, price, data_gb, apps)
SOCIAL_AI = [
    ("pack-social-1gb", "Social 1 GB",  1.99, 1, ["Facebook", "Instagram"]),
    ("pack-social-3gb", "Social 3 GB",  3.99, 3, ["Facebook", "Instagram", "TikTok"]),
    ("pack-social-5gb", "Social 5 GB",  5.49, 5, ["Facebook", "Instagram", "TikTok", "X"]),
    ("pack-free-ai",    "Free AI 1 GB", 0.00, 1, ["ChatGPT", "Claude", "Perplexity", "DeepSeek"]),
    ("pack-ai-talk",    "AI Talk",      2.99, 1, ["AI Talk"]),
    ("pack-youtube",    "YouTube pack", 4.49, 5, ["YouTube"]),
]
SMS_PACKS = [("addon-sms-50","50 SMS",0.49,50),("addon-sms-150","150 SMS",1.19,150),
             ("addon-sms-250","250 SMS",1.79,250),("addon-sms-500","500 SMS",2.99,500),
             ("addon-sms-1000","1000 SMS",4.99,1000)]
MINUTE_PACKS = [
    ("addon-min-100",  "100 national minutes",  1.49, 100,  "national"),
    ("addon-min-300",  "300 national minutes",  3.49, 300,  "national"),
    ("addon-min-600",  "600 national minutes",  5.99, 600,  "national"),
    ("addon-min-unl",  "Unlimited national minutes", 9.99, UNLIMITED, "national"),
    ("addon-intl-30",  "30 international minutes",  4.99, 30,  "international"),
    ("addon-intl-60",  "60 international minutes",  8.99, 60,  "international"),
    ("addon-intl-120", "120 international minutes", 15.99, 120, "international"),
    ("addon-intl-300", "300 international minutes", 34.99, 300, "international"),
]
# A genuinely free service carries 0 in both price columns. That is a fact, not a gap.
NETWORK_ADDONS = [
    ("addon-volte",   "VoLTE",                0.00),
    ("addon-vowifi",  "VoWiFi",               0.00),
    ("addon-5g",      "5G access",            2.99),
    ("addon-balance-notify", "Balance notification", 0.00),
]
CALL_SERVICES = [
    ("svc-owner-of-my-number", "Owner of my number", 0.00),
    ("svc-dialing-rule",       "The dialing rule",   0.99),
    ("svc-conference-call",    "Conference call",    1.49),
    ("svc-be-my-guest",        "Be My Guest",        0.00),
    ("svc-i-am-back",          "I Am Back",          0.00),
    ("svc-i-called-you",       "I Called You",       0.00),
    ("svc-call-divert",        "Call Divert",        0.79),
    ("svc-hidden-number",      "Hidden Number",      1.29),
    ("svc-call-waiting",       "Call Waiting",       0.00),
    ("svc-voice-mail",         "Voice Mail",         0.99),
    ("svc-call-sms-barring",   "Call and SMS barring", 0.00),
    ("svc-caller-tunes",       "Caller Tunes",       1.99),
]

# ----------------------------------------------------------------------------------------
# Roaming
# ----------------------------------------------------------------------------------------
ZONES = [("tr-cis", "Turkiye and CIS", 1.0), ("europe", "Europe", 1.4), ("world", "World", 2.0)]
ROAM_SIZES = [("500mb", "500 MB", 0.5, 4.99), ("1gb", "1 GB", 1, 7.99),
              ("3gb", "3 GB", 3, 17.99), ("5gb", "5 GB", 5, 24.99)]
ROAM_ALLIN = [(7, 29.99), (14, 49.99)]
ROAM_CALLS = [("roam-call-30","30 roaming minutes",9.99,30),("roam-call-60","60 roaming minutes",17.99,60),
              ("roam-call-120","120 roaming minutes",31.99,120),("roam-call-300","300 roaming minutes",69.99,300)]
ROAM_SMS = [("roam-sms-20","20 roaming SMS",3.99,20),("roam-sms-50","50 roaming SMS",8.99,50),
            ("roam-sms-100","100 roaming SMS",15.99,100)]
TRAVELSIM_DESTINATIONS = ["Turkiye", "Georgia", "United Arab Emirates", "Germany", "United Kingdom", "United States"]

# ----------------------------------------------------------------------------------------
# Numbers and SIM
# ----------------------------------------------------------------------------------------
NUMBERS_SIM = [
    ("sim-physical",   "Physical SIM",            "sim",    2.99),
    ("sim-4g-5gb",     "4G SIM with 5 GB",        "sim",    6.99),
    ("esim-new",       "New eSIM",                "esim",   2.99),
    ("esim-swap",      "Switch your number to eSIM", "esim", 0.00),
    ("number-mnp",     "Keep your number, move to D-TELCO", "number", 0.00),
    ("number-099",     "099 prefix number",       "number", 1.99),
    ("number-lovely-bronze", "Lovely number Bronze", "number", 19.99),
    ("number-lovely-silver", "Lovely number Silver", "number", 49.99),
    ("number-lovely-gold",   "Lovely number Gold",   "number", 149.99),
    ("number-lovely-platinum","Lovely number Platinum","number", 499.99),
]

# ----------------------------------------------------------------------------------------
# Devices. (slug, title, maker, price, storages, colours, five_g)
# ----------------------------------------------------------------------------------------
PHONES = [
    ("iphone-17-pro-max", "iPhone 17 Pro Max", "Apple", 1449.00, ["256 GB","512 GB","1 TB"], ["Black","Natural","Blue"]),
    ("iphone-17-pro",     "iPhone 17 Pro",     "Apple", 1249.00, ["256 GB","512 GB","1 TB"], ["Black","Natural","Blue"]),
    ("iphone-17",         "iPhone 17",         "Apple",  949.00, ["128 GB","256 GB","512 GB"], ["Black","White","Teal"]),
    ("iphone-16-pro-max", "iPhone 16 Pro Max", "Apple", 1199.00, ["256 GB","512 GB"], ["Black","Natural","Desert"]),
    ("iphone-16-pro",     "iPhone 16 Pro",     "Apple",  999.00, ["128 GB","256 GB","512 GB"], ["Black","Natural","Desert"]),
    ("iphone-16",         "iPhone 16",         "Apple",  799.00, ["128 GB","256 GB"], ["Black","Pink","Teal"]),
    ("iphone-16e",        "iPhone 16e",        "Apple",  599.00, ["128 GB","256 GB"], ["Black","White"]),
    ("iphone-15",         "iPhone 15",         "Apple",  649.00, ["128 GB","256 GB"], ["Black","Blue","Green"]),
    ("galaxy-s25-ultra",  "Galaxy S25 Ultra",  "Samsung", 1299.00, ["256 GB","512 GB","1 TB"], ["Titanium Black","Titanium Grey","Titanium Blue"]),
    ("galaxy-s25-plus",   "Galaxy S25+",       "Samsung", 1049.00, ["256 GB","512 GB"], ["Navy","Silver","Mint"]),
    ("galaxy-s25",        "Galaxy S25",        "Samsung",  849.00, ["128 GB","256 GB"], ["Navy","Silver","Mint"]),
    ("galaxy-s25-fe",     "Galaxy S25 FE",     "Samsung",  649.00, ["128 GB","256 GB"], ["Navy","White"]),
    ("galaxy-z-fold-7",   "Galaxy Z Fold 7",   "Samsung", 1899.00, ["256 GB","512 GB"], ["Black","Silver"]),
    ("galaxy-z-flip-7",   "Galaxy Z Flip 7",   "Samsung", 1099.00, ["256 GB","512 GB"], ["Black","Mint"]),
    ("galaxy-a56",        "Galaxy A56",        "Samsung",  449.00, ["128 GB","256 GB"], ["Graphite","Olive","Pink"]),
    ("galaxy-a36",        "Galaxy A36",        "Samsung",  349.00, ["128 GB","256 GB"], ["Black","Lavender"]),
    ("galaxy-a26",        "Galaxy A26",        "Samsung",  249.00, ["128 GB"], ["Black","Mint","White"]),
    ("galaxy-a16",        "Galaxy A16",        "Samsung",  179.00, ["128 GB"], ["Black","Blue"]),
    ("pixel-10-pro-xl",   "Pixel 10 Pro XL",   "Google",  1199.00, ["256 GB","512 GB"], ["Obsidian","Porcelain","Jade"]),
    ("pixel-10-pro",      "Pixel 10 Pro",      "Google",   999.00, ["128 GB","256 GB","512 GB"], ["Obsidian","Porcelain","Jade"]),
    ("pixel-10",          "Pixel 10",          "Google",   799.00, ["128 GB","256 GB"], ["Obsidian","Frost","Indigo"]),
    ("pixel-9a",          "Pixel 9a",          "Google",   499.00, ["128 GB","256 GB"], ["Obsidian","Porcelain","Peony"]),
    ("xiaomi-15-ultra",   "Xiaomi 15 Ultra",   "Xiaomi",  1099.00, ["256 GB","512 GB"], ["Black","White","Silver"]),
    ("xiaomi-15-pro",     "Xiaomi 15 Pro",     "Xiaomi",   899.00, ["256 GB","512 GB"], ["Black","Green"]),
    ("xiaomi-15",         "Xiaomi 15",         "Xiaomi",   699.00, ["128 GB","256 GB"], ["Black","White","Green"]),
    ("xiaomi-15t-pro",    "Xiaomi 15T Pro",    "Xiaomi",   649.00, ["256 GB","512 GB"], ["Grey","Blue"]),
    ("xiaomi-15t",        "Xiaomi 15T",        "Xiaomi",   499.00, ["128 GB","256 GB"], ["Grey","Blue","Rose"]),
    ("xiaomi-14t",        "Xiaomi 14T",        "Xiaomi",   399.00, ["128 GB","256 GB"], ["Black","Lemon"]),
    ("poco-f7",           "Poco F7",           "Xiaomi",   379.00, ["256 GB","512 GB"], ["Black","Silver"]),
    ("poco-x7-pro",       "Poco X7 Pro",       "Xiaomi",   299.00, ["256 GB"], ["Black","Green","Yellow"]),
    ("honor-magic-7-pro", "Honor Magic 7 Pro", "Honor",    999.00, ["256 GB","512 GB"], ["Black","Lunar Grey"]),
    ("honor-magic-7",     "Honor Magic 7",     "Honor",    799.00, ["256 GB"], ["Black","Green"]),
    ("honor-400-pro",     "Honor 400 Pro",     "Honor",    549.00, ["256 GB","512 GB"], ["Black","Grey"]),
    ("honor-400",         "Honor 400",         "Honor",    399.00, ["128 GB","256 GB"], ["Black","Gold"]),
    ("honor-x9c",         "Honor X9c",         "Honor",    269.00, ["256 GB"], ["Black","Jade Cyan"]),
    ("redmi-note-14-pro-plus", "Redmi Note 14 Pro+", "Redmi", 349.00, ["256 GB","512 GB"], ["Black","Purple"]),
    ("redmi-note-14-pro", "Redmi Note 14 Pro", "Redmi",    279.00, ["128 GB","256 GB"], ["Black","Blue"]),
    ("redmi-note-14",     "Redmi Note 14",     "Redmi",    219.00, ["128 GB","256 GB"], ["Black","Green"]),
    ("redmi-14c",         "Redmi 14C",         "Redmi",    139.00, ["128 GB"], ["Black","Blue","Green"]),
    ("redmi-a4",          "Redmi A4",          "Redmi",     99.00, ["64 GB","128 GB"], ["Black","Green"]),
]
TABLETS = [
    ("ipad-pro-13",   "iPad Pro 13",     "Apple",  1299.00, ["256 GB","512 GB"], ["Space Black","Silver"]),
    ("ipad-air-13",   "iPad Air 13",     "Apple",   799.00, ["128 GB","256 GB"], ["Space Grey","Blue"]),
    ("ipad-11",       "iPad 11",         "Apple",   449.00, ["128 GB","256 GB"], ["Blue","Silver"]),
    ("galaxy-tab-s11-ultra", "Galaxy Tab S11 Ultra", "Samsung", 1199.00, ["256 GB","512 GB"], ["Graphite"]),
    ("galaxy-tab-s11", "Galaxy Tab S11", "Samsung",  799.00, ["128 GB","256 GB"], ["Graphite","Beige"]),
    ("galaxy-tab-a9-plus", "Galaxy Tab A9+", "Samsung", 229.00, ["64 GB","128 GB"], ["Graphite","Silver"]),
    ("redmi-pad-pro", "Redmi Pad Pro",   "Redmi",   279.00, ["128 GB","256 GB"], ["Grey","Green"]),
    ("honor-pad-10",  "Honor Pad 10",    "Honor",   249.00, ["128 GB","256 GB"], ["Grey","Blue"]),
]
WEARABLES = [
    ("apple-watch-s11",    "Apple Watch Series 11", "Apple",   449.00, ["42 mm","46 mm"], ["Midnight","Starlight"]),
    ("apple-watch-se3",    "Apple Watch SE 3",      "Apple",   259.00, ["40 mm","44 mm"], ["Midnight","Silver"]),
    ("galaxy-watch8",      "Galaxy Watch8",         "Samsung", 349.00, ["40 mm","44 mm"], ["Graphite","Silver"]),
    ("galaxy-fit4",        "Galaxy Fit4",           "Samsung",  69.00, ["One size"], ["Black","Pink"]),
    ("xiaomi-smart-band-10", "Xiaomi Smart Band 10", "Xiaomi",  49.00, ["One size"], ["Black","Silver"]),
    ("honor-watch-5",      "Honor Watch 5",         "Honor",   149.00, ["One size"], ["Black","Gold"]),
]
ROUTERS = [
    ("router-5g-home",   "5G Home Router",       "D·TELCO", 249.00, ["One size"], ["White"]),
    ("router-4g-home",   "4G Home Router",       "D·TELCO", 129.00, ["One size"], ["White"]),
    ("mifi-5g",          "5G MiFi pocket router","D·TELCO", 179.00, ["One size"], ["Black","White"]),
    ("mifi-4g",          "4G MiFi pocket router","D·TELCO",  89.00, ["One size"], ["Black"]),
    ("router-wifi6-hub", "Wi-Fi 6 Home Hub",     "D·TELCO", 149.00, ["One size"], ["White"]),
    ("router-wifi7-hub", "Wi-Fi 7 Home Hub",     "D·TELCO", 219.00, ["One size"], ["White","Black"]),
]

# (slug, title, maker, price, kind, colours, fits) -- fits drives compatible_with and cross_sell
ACCESSORIES = [
    ("case-iphone-17-pro-max", "Silicone case for iPhone 17 Pro Max", "Apple", 49.00, "case", ["Black","Blue","Sand"], ["iphone-17-pro-max"]),
    ("case-iphone-17-pro",     "Silicone case for iPhone 17 Pro",     "Apple", 49.00, "case", ["Black","Blue","Sand"], ["iphone-17-pro"]),
    ("case-iphone-17",         "Silicone case for iPhone 17",         "Apple", 39.00, "case", ["Black","Pink","Teal"], ["iphone-17"]),
    ("case-iphone-16-pro",     "Silicone case for iPhone 16 Pro",     "Apple", 45.00, "case", ["Black","Blue"], ["iphone-16-pro","iphone-16-pro-max"]),
    ("case-iphone-16",         "Silicone case for iPhone 16",         "Apple", 35.00, "case", ["Black","Pink"], ["iphone-16","iphone-16e"]),
    ("case-galaxy-s25-ultra",  "Protective case for Galaxy S25 Ultra","Samsung", 44.00, "case", ["Black","Navy"], ["galaxy-s25-ultra"]),
    ("case-galaxy-s25",        "Protective case for Galaxy S25",      "Samsung", 34.00, "case", ["Black","Mint"], ["galaxy-s25","galaxy-s25-plus","galaxy-s25-fe"]),
    ("case-pixel-10-pro",      "Protective case for Pixel 10 Pro",    "Google",  39.00, "case", ["Obsidian","Jade"], ["pixel-10-pro","pixel-10-pro-xl"]),
    ("case-pixel-10",          "Protective case for Pixel 10",        "Google",  32.00, "case", ["Obsidian","Indigo"], ["pixel-10","pixel-9a"]),
    ("case-universal-clear",   "Clear case, universal fit",           "D·TELCO", 14.00, "case", ["Clear"], []),
    ("charger-usbc-20w",   "20 W USB-C charger",        "D·TELCO", 24.00, "charger", ["White"], []),
    ("charger-usbc-45w",   "45 W USB-C charger",        "D·TELCO", 39.00, "charger", ["White","Black"], []),
    ("charger-magsafe",    "Magnetic wireless charger", "Apple",   49.00, "charger", ["White"], ["iphone-17-pro-max","iphone-17-pro","iphone-17","iphone-16-pro","iphone-16"]),
    ("charger-car-usbc",   "Car charger USB-C",         "D·TELCO", 19.00, "charger", ["Black"], []),
    ("charger-wireless-pad","Wireless charging pad",    "Samsung", 44.00, "charger", ["Black","White"], ["galaxy-s25-ultra","galaxy-s25","galaxy-z-flip-7"]),
    ("charger-gan-65w",    "65 W GaN travel charger",   "D·TELCO", 54.00, "charger", ["Black"], []),
    ("buds-airpods-pro-3", "AirPods Pro 3",             "Apple",  249.00, "earbuds", ["White"], ["iphone-17-pro-max","iphone-17-pro","iphone-17","iphone-16-pro","iphone-16","iphone-16e","iphone-15"]),
    ("buds-airpods-4",     "AirPods 4",                 "Apple",  149.00, "earbuds", ["White"], ["iphone-17","iphone-16","iphone-16e","iphone-15"]),
    ("buds-galaxy-3-pro",  "Galaxy Buds3 Pro",          "Samsung",219.00, "earbuds", ["Silver","White"], ["galaxy-s25-ultra","galaxy-s25-plus","galaxy-s25","galaxy-z-fold-7","galaxy-z-flip-7"]),
    ("buds-pixel-pro-2",   "Pixel Buds Pro 2",          "Google", 199.00, "earbuds", ["Porcelain","Hazel"], ["pixel-10-pro-xl","pixel-10-pro","pixel-10","pixel-9a"]),
    ("buds-redmi-6",       "Redmi Buds 6",              "Redmi",   39.00, "earbuds", ["Black","White"], []),
    ("buds-honor-earbuds", "Honor Earbuds Open",        "Honor",   99.00, "earbuds", ["Black","Grey"], []),
    ("power-5000",  "5 000 mAh power bank",  "D·TELCO", 24.00, "powerbank", ["Black","White"], []),
    ("power-10000", "10 000 mAh power bank", "D·TELCO", 39.00, "powerbank", ["Black","Blue"], []),
    ("power-20000", "20 000 mAh power bank", "D·TELCO", 59.00, "powerbank", ["Black"], []),
    ("power-magnetic-5000", "5 000 mAh magnetic power bank", "D·TELCO", 49.00, "powerbank", ["White","Black"], ["iphone-17-pro","iphone-17","iphone-16-pro","iphone-16"]),
    ("screen-iphone-17",  "Screen protector for iPhone 17 family", "D·TELCO", 19.00, "screen", ["Clear"], ["iphone-17-pro-max","iphone-17-pro","iphone-17"]),
    ("screen-iphone-16",  "Screen protector for iPhone 16 family", "D·TELCO", 19.00, "screen", ["Clear"], ["iphone-16-pro-max","iphone-16-pro","iphone-16","iphone-16e"]),
    ("screen-galaxy-s25", "Screen protector for Galaxy S25 family", "D·TELCO", 19.00, "screen", ["Clear"], ["galaxy-s25-ultra","galaxy-s25-plus","galaxy-s25","galaxy-s25-fe"]),
    ("screen-pixel-10",   "Screen protector for Pixel 10 family",   "D·TELCO", 19.00, "screen", ["Clear"], ["pixel-10-pro-xl","pixel-10-pro","pixel-10"]),
]

FIBER = [("fiber-100","D·TELCO Fiber 100 Mbps",19.99,100),("fiber-300","D·TELCO Fiber 300 Mbps",29.99,300),
         ("fiber-500","D·TELCO Fiber 500 Mbps",39.99,500),("fiber-1000","D·TELCO Fiber 1 Gbps",54.99,1000)]
WIFI_PACKS = [("wifi-5","D·TELCO Wi-Fi 5",5.00,5),("wifi-10","D·TELCO Wi-Fi 10",10.00,10),
              ("wifi-25","D·TELCO Wi-Fi 25",25.00,25),("wifi-50","D·TELCO Wi-Fi 50",50.00,50),
              ("wifi-75","D·TELCO Wi-Fi 75",75.00,75),("wifi-100","D·TELCO Wi-Fi 100",100.00,100),
              ("wifi-150","D·TELCO Wi-Fi 150",150.00,150),("wifi-175","D·TELCO Wi-Fi 175",175.00,175)]
HOME_DEVICES = [("home-ont","Fiber ONT terminal","D·TELCO",79.00),
                ("home-mesh","Mesh Wi-Fi node","D·TELCO",99.00),
                ("home-tvbox","D·TELCO TV box","D·TELCO",69.00)]

# (slug, title, phone_slug, plan_slug, price, free_data_months)
DEVICE_PLAN_BUNDLES = [
    ("bundle-iphone-17-pro-klass-31", "iPhone 17 Pro with Klass 31", "iphone-17-pro", "klass-31-postpaid", 1279.00, 18),
    ("bundle-iphone-17-klass-19",     "iPhone 17 with Klass 19",     "iphone-17",     "klass-19-postpaid",  969.00, 18),
    ("bundle-iphone-16-go-29-99",     "iPhone 16 with GO 29.99",     "iphone-16",     "go-29-99",           819.00, 12),
    ("bundle-iphone-16e-go-17-99",    "iPhone 16e with GO 17.99",    "iphone-16e",    "go-17-99",           615.00, 12),
    ("bundle-galaxy-s25-ultra-klass-55", "Galaxy S25 Ultra with Klass 55", "galaxy-s25-ultra", "klass-55-postpaid", 1329.00, 18),
    ("bundle-galaxy-s25-klass-19",    "Galaxy S25 with Klass 19",    "galaxy-s25",    "klass-19-postpaid",  869.00, 18),
    ("bundle-galaxy-a56-go-17-99",    "Galaxy A56 with GO 17.99",    "galaxy-a56",    "go-17-99",           465.00, 12),
    ("bundle-pixel-10-pro-klass-31",  "Pixel 10 Pro with Klass 31",  "pixel-10-pro",  "klass-31-postpaid", 1029.00, 18),
    ("bundle-pixel-10-go-29-99",      "Pixel 10 with GO 29.99",      "pixel-10",      "go-29-99",           819.00, 12),
    ("bundle-redmi-note-14-go-11-99", "Redmi Note 14 with GO 11.99", "redmi-note-14", "go-11-99",           229.00, 12),
]
FAMILY_BUNDLES = [
    ("bundle-family-2", "Family 2 lines", 2, "klass-19-postpaid", 34.00),
    ("bundle-family-3", "Family 3 lines", 3, "klass-19-postpaid", 48.00),
    ("bundle-family-4", "Family 4 lines", 4, "klass-19-postpaid", 60.00),
]
CONVERGENCE_BUNDLES = [
    ("bundle-converge-300", "Fiber 300 with Klass 19", "fiber-300", "klass-19-postpaid", 44.99),
    ("bundle-converge-1000","Fiber 1 Gbps with Klass 31", "fiber-1000", "klass-31-postpaid", 74.99),
]
TRAVEL_BUNDLES = [
    ("bundle-travel-europe", "GO 29.99 with Europe 3 GB roaming", "go-29-99", "roam-europe-3gb", 49.99),
    ("bundle-travel-world",  "Klass 31 with World 3 GB roaming",  "klass-31-postpaid", "roam-world-3gb", 59.99),
]
