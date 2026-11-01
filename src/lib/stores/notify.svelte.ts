/**
 * Kleine notificatiebaan voor status- en foutmeldingen ("toasts").
 * Bewust gescheiden van opslagfouten: de events-store houdt een permanente
 * `storageError` bij, hier komen kortstondige meldingen in.
 */

export interface Notice {
	id: number;
	kind: 'info' | 'success' | 'error';
	message: string;
}

let nextId = 1;

class NoticeStore {
	list = $state<Notice[]>([]);
	#timers = new Map<number, ReturnType<typeof setTimeout>>();

	push(kind: Notice['kind'], message: string, durationMs = 6000): void {
		const id = nextId++;
		this.list = [...this.list, { id, kind, message }];
		if (durationMs > 0) {
			this.#timers.set(
				id,
				setTimeout(() => this.dismiss(id), durationMs)
			);
		}
	}

	success(message: string): void {
		this.push('success', message);
	}

	error(message: string): void {
		this.push('error', message, 10000);
	}

	info(message: string): void {
		this.push('info', message);
	}

	dismiss(id: number): void {
		const timer = this.#timers.get(id);
		if (timer) {
			clearTimeout(timer);
			this.#timers.delete(id);
		}
		this.list = this.list.filter((notice) => notice.id !== id);
	}
}

export const notify = new NoticeStore();
