import type { Alpine } from 'alpinejs';

export type BandaModal = {
	id: string;
	nome: string;
	cidade: string;
	uf: string;
	formacao: number;
	encerramento: number | null;
	generos: string;
	resumo: string;
	url: string;
};

type AgentMsg = { role: 'user' | 'assistant'; content: string };

export default (Alpine: Alpine) => {
	Alpine.store('modal', {
		open: false,
		banda: null as BandaModal | null,
		show(banda: BandaModal) {
			this.banda = banda;
			this.open = true;
			document.documentElement.classList.add('overflow-hidden');
		},
		close() {
			this.open = false;
			this.banda = null;
			document.documentElement.classList.remove('overflow-hidden');
		},
	});

	Alpine.data('agentChat', () => ({
		messages: [] as AgentMsg[],
		input: '',
		loading: false,
		images: [] as Array<{ base64: string; mime: string; name: string }>,

		async send() {
			const text = this.input.trim();
			if (this.loading || (!text && this.images.length === 0)) return;

			const attachLabel =
				this.images.length === 0
					? ''
					: this.images.length === 1
						? `📎 ${this.images[0]!.name}`
						: `📎 ${this.images.length} imagens`;
			this.messages.push({
				role: 'user',
				content: [text, attachLabel].filter(Boolean).join('\n') || attachLabel,
			});
			this.input = '';
			this.loading = true;
			this.$nextTick(() => this.scroll());

			const payload: Record<string, unknown> = { message: text };
			if (this.images.length) {
				payload.images = this.images.map((img) => ({
					base64: img.base64,
					mime: img.mime,
					filename: img.name,
				}));
			}

			try {
				const res = await fetch('/api/agent/chat', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify(payload),
				});
				const data = await res.json();
				if (!res.ok) throw new Error(data.error || 'Falha no agente');
				this.messages.push({ role: 'assistant', content: data.reply || '(sem resposta)' });
				this.clearImages();
			} catch (error) {
				this.messages.push({
					role: 'assistant',
					content: error instanceof Error ? error.message : 'Erro ao falar com o agente.',
				});
			} finally {
				this.loading = false;
				this.$nextTick(() => this.scroll());
			}
		},

		onFile(event: Event) {
			const input = event.target as HTMLInputElement;
			const files = [...(input.files ?? [])];
			input.value = '';
			if (!files.length) return;

			const max = 8;
			const remaining = max - this.images.length;
			if (remaining <= 0) {
				this.messages.push({
					role: 'assistant',
					content: `Você já anexou ${max} imagens (máximo por relatório).`,
				});
				return;
			}

			for (const file of files.slice(0, remaining)) {
				if (file.size > 5 * 1024 * 1024) {
					this.messages.push({
						role: 'assistant',
						content: `"${file.name}" passa de 5 MB e foi ignorada.`,
					});
					continue;
				}
				const reader = new FileReader();
				reader.onload = () => {
					const result = String(reader.result || '');
					const match = /^data:([^;]+);base64,(.+)$/.exec(result);
					if (!match) return;
					if (this.images.length >= max) return;
					this.images.push({
						mime: match[1]!,
						base64: match[2]!,
						name: file.name,
					});
				};
				reader.readAsDataURL(file);
			}
		},

		removeImage(index: number) {
			this.images.splice(index, 1);
		},

		clearImages() {
			this.images = [];
		},

		scroll() {
			const el = this.$refs.scroller as HTMLElement | undefined;
			if (el) el.scrollTop = el.scrollHeight;
		},
	}));
};