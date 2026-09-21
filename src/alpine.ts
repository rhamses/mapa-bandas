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
		imageBase64: '' as string,
		imageMime: '' as string,
		imageName: '' as string,

		async send() {
			const text = this.input.trim();
			if (this.loading || (!text && !this.imageBase64)) return;

			this.messages.push({
				role: 'user',
				content: text || `📎 ${this.imageName || 'imagem'}`,
			});
			this.input = '';
			this.loading = true;
			this.$nextTick(() => this.scroll());

			const payload: Record<string, string> = { message: text };
			if (this.imageBase64) {
				payload.image_base64 = this.imageBase64;
				payload.image_mime = this.imageMime || 'image/jpeg';
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
				this.clearImage();
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
			const file = input.files?.[0];
			if (!file) return;
			if (file.size > 5 * 1024 * 1024) {
				this.messages.push({ role: 'assistant', content: 'A imagem pode ter no máximo 5 MB.' });
				input.value = '';
				return;
			}
			const reader = new FileReader();
			reader.onload = () => {
				const result = String(reader.result || '');
				const match = /^data:([^;]+);base64,(.+)$/.exec(result);
				if (!match) return;
				this.imageMime = match[1]!;
				this.imageBase64 = match[2]!;
				this.imageName = file.name;
			};
			reader.readAsDataURL(file);
		},

		clearImage() {
			this.imageBase64 = '';
			this.imageMime = '';
			this.imageName = '';
		},

		scroll() {
			const el = this.$refs.scroller as HTMLElement | undefined;
			if (el) el.scrollTop = el.scrollHeight;
		},
	}));
};
