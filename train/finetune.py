# til-native small model — QLoRA fine-tune on the self-validated corpus.
# Colab-ready (T4 is enough for a 0.5-1.5B base). Not executed in this repo's CI.
#
#   pip install unsloth datasets trl
#   python train/finetune.py            # expects train/corpus.jsonl next to this file
#
# Design notes:
# - The model learns til WITHOUT the card in context (the point: bake it into weights);
#   eval afterward compares card-free hard-suite pass@1 vs the base model with card.
# - Corpus programs are all execution-verified (train/corpus.mjs) — no unvalidated text.
import json
from pathlib import Path

BASE = "Qwen/Qwen2.5-0.5B-Instruct"   # swap for any small instruct base
CORPUS = Path(__file__).parent / "corpus.jsonl"
OUT = Path(__file__).parent / "til-adapter"

def rows():
    for line in CORPUS.open():
        r = json.loads(line)
        files = "".join(f"\n--- {n} ---\n{c[:300]}" for n, c in r["files"].items())
        yield {
            "messages": [
                {"role": "system", "content": "You write programs in til, a small scripting language. Reply with only the program."},
                {"role": "user", "content": r["instruction"] + (f"\n\nInput files:{files}" if files else "")},
                {"role": "assistant", "content": r["program"].strip()},
            ]
        }

def main():
    from unsloth import FastLanguageModel
    from datasets import Dataset
    from trl import SFTConfig, SFTTrainer

    model, tokenizer = FastLanguageModel.from_pretrained(BASE, max_seq_length=1024, load_in_4bit=True)
    model = FastLanguageModel.get_peft_model(model, r=16, lora_alpha=32, target_modules="all-linear")

    ds = Dataset.from_list(list(rows()))
    ds = ds.map(lambda r: {"text": tokenizer.apply_chat_template(r["messages"], tokenize=False)})

    trainer = SFTTrainer(
        model=model,
        train_dataset=ds,
        args=SFTConfig(
            output_dir=str(OUT), per_device_train_batch_size=8, gradient_accumulation_steps=2,
            num_train_epochs=1, learning_rate=2e-4, logging_steps=50, bf16=True,
            dataset_text_field="text", max_length=1024, report_to="none",
        ),
    )
    trainer.train()
    model.save_pretrained(str(OUT))
    tokenizer.save_pretrained(str(OUT))
    print(f"adapter saved → {OUT}")
    print("next: evaluate card-free with eval/verify-batch.mjs against eval/hard/tasks.json")

if __name__ == "__main__":
    main()
