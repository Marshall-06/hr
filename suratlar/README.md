# Suratlar — anketa № boýunça skan JPG

## Nähili işleýär?

1. **Excel** — anketa maglumatyny doldurýar.
2. **Skan papkasy** — awgust **2026**-dan öň anketalar açylanda şu papkadaky JPG görkezilýär (№ boýunça).
3. Awgust 2026-dan soň — programma formaty.

**Berkit / ýükleme gerek däl** — Admin → Excel-de papka ýoluny **Sakla**.

## Nirede saklamaly?

`suratlar/` içine ýa-da islendik disk papkasy:

```
kerwen_kadr/suratlar/
  Anketa baza 2026/
    Iýun/
      26.2.78.jpg
```

ýa-da:

```
D:\Anketa baza\
  26.2.78.jpg
```

Içerki ýyl / aý papkalary awto gözlenýär.

## № gabatlaşmasy

| Programmada | Faýl ady | Netije |
|-------------|----------|--------|
| `26/2/78` | `26.2.78.jpg` | ✓ |
| `26/2/78` | `26-2-78.jpg` | ✓ |
| `26/5/10` | `26.5.10.E.jpg` | ✓ |

## .env

```
ANKETA_SCAN_DIR=D:\Anketa baza
```
