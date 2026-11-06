"""Build deterministic question bundles from reviewed editorial rows."""
import csv
import json
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parent
database = json.loads((ROOT / 'questions.json').read_text())
questions = database['questions']
by_id = {item['id']: item for item in questions}
updates = list(csv.DictReader((ROOT / 'russian-editorial.tsv').open(), delimiter='\t'))
for row in updates:
    if row['id'] not in by_id:
        raise ValueError(f"Unknown editorial ID: {row['id']}")
    item = by_id[row['id']]
    item.update(question=row['question'], answer=row['answer'], points=int(row['points']))
    item['accepted_answers'] = list(dict.fromkeys([row['answer']] + [v.strip() for v in row['accepted_answers'].split(';') if v.strip()]))
    item['editorial_revision'] = 5

category_names = {'geography':'География','mathematics':'Математика','logic':'Логика','biology':'Биология','general':'Общие знания','history':'История','pop_culture':'Поп-культура'}
english = []
counters = Counter()
for row in csv.DictReader((ROOT / 'english-editorial.tsv').open(), delimiter='\t'):
    category = row['category']
    counters[category] += 1
    english.append(dict(id=f'en-{category}-{counters[category]:04d}',category=category_names[category],category_key=category,points=int(row['points']),question=row['question'],answer=row['answer'],accepted_answers=list(dict.fromkeys([row['answer']] + [v.strip() for v in row['accepted_answers'].split(';') if v.strip()])),editorial_revision=5))

# Fix mistranslations, answer-leaking prompts and one repeated maths fact.
english[61].update(question='Is 25 a prime number or a composite number?', answer='Composite number', accepted_answers=['Composite number','Composite'])
english[302].update(accepted_answers=['Bruce Wayne'])
english[303].update(question="What is Spider-Man's civilian name in the original Marvel comics?",answer='Peter Parker',accepted_answers=['Peter Parker'])
english[333].update(question='Which 2015 Pixar film takes place partly inside Riley\'s mind?',answer='Inside Out',accepted_answers=['Inside Out'])
english[339].update(question="What is Wednesday's surname in the Netflix series?",answer='Addams',accepted_answers=['Addams'])

# Small, traceable corrections to the already approved banks. Keep this after
# the older TSV editorial layer, so a rebuild never silently reverts a fix.
overrides = json.loads((ROOT / 'editorial-overrides.json').read_text())
for language, bank in [('ru', questions), ('en', english)]:
    indexed = {item['id']: item for item in bank}
    seen_override_ids = set()
    for change in overrides[language]:
        item_id = change['id']
        if item_id in seen_override_ids or item_id not in indexed:
            raise ValueError(f'Duplicate or unknown {language} editorial override: {item_id}')
        seen_override_ids.add(item_id)
        item = indexed[item_id]
        for field in ('question', 'answer', 'points', 'accepted_answers'):
            if field in change:
                item[field] = change[field]
        if 'answer' in change and 'accepted_answers' not in change:
            item['accepted_answers'] = [change['answer']]
        if not item['question'] or not item['answer'] or not isinstance(item['points'], int) or not 1 <= item['points'] <= 8:
            raise ValueError(f'Invalid editorial override: {language}/{item_id}')
        if item['answer'] not in item['accepted_answers']:
            raise ValueError(f'Primary answer missing from variants: {language}/{item_id}')
        item['editorial_audit'] = 6

# Second editorial pass: keep a separate layer to make review and rollback of
# question changes independent from the first scoring/ambiguity cleanup.
round2 = json.loads((ROOT / 'editorial-overrides-round2.json').read_text())
for language, bank in [('ru', questions), ('en', english)]:
    indexed = {item['id']: item for item in bank}
    seen_override_ids = set()
    for change in round2[language]:
        item_id = change['id']
        if item_id in seen_override_ids or item_id not in indexed:
            raise ValueError(f'Duplicate or unknown {language} second-pass override: {item_id}')
        seen_override_ids.add(item_id)
        item = indexed[item_id]
        for field in ('question', 'answer', 'points', 'accepted_answers'):
            if field in change:
                item[field] = change[field]
        if 'answer' in change and 'accepted_answers' not in change:
            item['accepted_answers'] = [change['answer']]
        if not item['question'] or not item['answer'] or not isinstance(item['points'], int) or not 1 <= item['points'] <= 8:
            raise ValueError(f'Invalid second-pass override: {language}/{item_id}')
        if item['answer'] not in item['accepted_answers']:
            raise ValueError(f'Primary answer missing after second pass: {language}/{item_id}')
        item['editorial_audit_round2'] = 7

# Exact wording duplicates would undermine a shuffled deck; fail the build.
for lang, bank in [('ru', questions), ('en', english)]:
    ids = [q['id'] for q in bank]
    texts = [q['question'].strip().casefold().replace('ё','е') for q in bank]
    if len(set(ids)) != len(ids) or len(set(texts)) != len(texts):
        duplicates = [s for s,n in Counter(texts).items() if n>1]
        raise ValueError(f'Duplicate {lang} questions: {duplicates}')
    if any(not q['question'] or not q['answer'] or not 1 <= q['points'] <= 8 for q in bank):
        raise ValueError(f'Invalid {lang} questions')

database.update(version=5,updated_at='2026-11-06',title='Almost Said It — редакция RU/EN',language='ru')
english_database=dict(version=5,updated_at='2026-11-06',language='en',title='Almost Said It — English edition',questions=english)
(ROOT/'questions.json').write_text(json.dumps(database,ensure_ascii=False,indent=2)+'\n')
(ROOT/'questions-en.json').write_text(json.dumps(english_database,ensure_ascii=False,indent=2)+'\n')
(ROOT/'questions-ru.js').write_text('// Generated by rebuild-questions.py; edit editorial TSV files.\nwindow.ASI_QUESTION_BANK = '+json.dumps(questions,ensure_ascii=False,separators=(',',':'))+';\nwindow.ASI_QUESTION_BANK_EN = '+json.dumps(english,ensure_ascii=False,separators=(',',':'))+';\n')
print(f'RU: {len(questions)}; revised: {len(updates)} + {len(overrides["ru"])} + {len(round2["ru"])}. EN: {len(english)}; audits: {len(overrides["en"])} + {len(round2["en"])}; categories: {dict(counters)}')
