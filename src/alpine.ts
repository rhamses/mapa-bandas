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
};
