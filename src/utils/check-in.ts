import { formatDateToYYYYMMDD } from "./date-utils";

export type DailyTask = {
	id: string;
	text: string;
	completed: boolean;
	createdAt: string;
	completedAt?: string;
	reminderTime?: string;
};

export type ReminderType = "checkin" | "task";

export type ReminderItem = {
	id: string;
	type: ReminderType;
	label: string;
	time: string;
	enabled: boolean;
	targetId?: string;
	lastTriggeredOn?: string;
};

export type DailyPlan = {
	date: string;
	checkedIn: boolean;
	checkedInAt?: string;
	note: string;
	review: string;
	tasks: DailyTask[];
};

export type CheckInState = {
	plans: Record<string, DailyPlan>;
	reminders: ReminderItem[];
};

export type DailyOverview = {
	date: string;
	checkedIn: boolean;
	streak: number;
	monthlyCheckInCount: number;
	tasksTotal: number;
	tasksCompleted: number;
	nextReminder: ReminderItem | null;
	recentActivity: { date: string; checkedIn: boolean; completionRate: number }[];
};

export const CHECK_IN_STORAGE_KEY = "daily-execution-panel";

const DEFAULT_STATE: CheckInState = {
	plans: {},
	reminders: [],
};

function createId(prefix: string) {
	if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
		return `${prefix}-${crypto.randomUUID()}`;
	}

	return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function todayDateString() {
	return formatDateToYYYYMMDD(new Date());
}

export function createEmptyPlan(date = todayDateString()): DailyPlan {
	return {
		date,
		checkedIn: false,
		note: "",
		review: "",
		tasks: [],
	};
}

export function loadCheckInState(storage?: Storage | null): CheckInState {
	if (!storage) {
		return structuredClone(DEFAULT_STATE);
	}

	try {
		const raw = storage.getItem(CHECK_IN_STORAGE_KEY);
		if (!raw) {
			return structuredClone(DEFAULT_STATE);
		}

		const parsed = JSON.parse(raw) as Partial<CheckInState>;
		return {
			plans: parsed.plans && typeof parsed.plans === "object" ? parsed.plans : {},
			reminders: Array.isArray(parsed.reminders) ? parsed.reminders : [],
		};
	} catch {
		return structuredClone(DEFAULT_STATE);
	}
}

export function saveCheckInState(state: CheckInState, storage?: Storage | null) {
	if (!storage) {
		return;
	}
	storage.setItem(CHECK_IN_STORAGE_KEY, JSON.stringify(state));
}

export function getPlanForDate(state: CheckInState, date = todayDateString()): DailyPlan {
	return state.plans[date] || createEmptyPlan(date);
}

export function upsertPlan(state: CheckInState, plan: DailyPlan): CheckInState {
	return {
		...state,
		plans: {
			...state.plans,
			[plan.date]: plan,
		},
	};
}

export function markCheckedIn(plan: DailyPlan): DailyPlan {
	if (plan.checkedIn) {
		return plan;
	}

	return {
		...plan,
		checkedIn: true,
		checkedInAt: new Date().toISOString(),
	};
}

export function updatePlanText(plan: DailyPlan, key: "note" | "review", value: string): DailyPlan {
	return {
		...plan,
		[key]: value,
	};
}

export function addTask(plan: DailyPlan, text: string): DailyPlan {
	const normalizedText = text.trim();
	if (!normalizedText) {
		return plan;
	}

	const nextTask: DailyTask = {
		id: createId("task"),
		text: normalizedText,
		completed: false,
		createdAt: new Date().toISOString(),
	};

	return {
		...plan,
		tasks: [...plan.tasks, nextTask],
	};
}

export function toggleTask(plan: DailyPlan, taskId: string): DailyPlan {
	return {
		...plan,
		tasks: plan.tasks.map((task) => {
			if (task.id !== taskId) return task;
			const completed = !task.completed;
			return {
				...task,
				completed,
				completedAt: completed ? new Date().toISOString() : undefined,
			};
		}),
	};
}

export function removeTask(plan: DailyPlan, taskId: string): DailyPlan {
	return {
		...plan,
		tasks: plan.tasks.filter((task) => task.id !== taskId),
	};
}

export function setTaskReminder(plan: DailyPlan, taskId: string, reminderTime?: string): DailyPlan {
	return {
		...plan,
		tasks: plan.tasks.map((task) =>
			task.id === taskId
				? {
						...task,
						reminderTime,
					}
				: task,
		),
	};
}

export function createReminder(type: ReminderType, label: string, time: string, targetId?: string): ReminderItem {
	return {
		id: createId("reminder"),
		type,
		label,
		time,
		enabled: true,
		targetId,
	};
}

export function upsertReminder(state: CheckInState, reminder: ReminderItem): CheckInState {
	const existing = state.reminders.some((item) => item.id === reminder.id);
	return {
		...state,
		reminders: existing
			? state.reminders.map((item) => (item.id === reminder.id ? reminder : item))
			: [...state.reminders, reminder],
	};
}

export function toggleReminder(state: CheckInState, reminderId: string): CheckInState {
	return {
		...state,
		reminders: state.reminders.map((reminder) =>
			reminder.id === reminderId
				? {
						...reminder,
						enabled: !reminder.enabled,
					}
				: reminder,
		),
	};
}

export function removeReminder(state: CheckInState, reminderId: string): CheckInState {
	return {
		...state,
		reminders: state.reminders.filter((reminder) => reminder.id !== reminderId),
	};
}

function calculateStreak(state: CheckInState, date: string) {
	let streak = 0;
	const cursor = new Date(`${date}T00:00:00`);

	while (true) {
		const key = formatDateToYYYYMMDD(cursor);
		const plan = state.plans[key];
		if (!plan?.checkedIn) {
			break;
		}

		streak += 1;
		cursor.setDate(cursor.getDate() - 1);
	}

	return streak;
}

function calculateMonthlyCheckInCount(state: CheckInState, date: string) {
	const [year, month] = date.split("-").map(Number);
	return Object.values(state.plans).filter((plan) => {
		if (!plan.checkedIn) return false;
		const planDate = new Date(`${plan.date}T00:00:00`);
		return planDate.getFullYear() === year && planDate.getMonth() + 1 === month;
	}).length;
}

function getNextReminder(reminders: ReminderItem[]) {
	const enabledReminders = reminders.filter((item) => item.enabled).sort((a, b) => a.time.localeCompare(b.time));
	return enabledReminders[0] || null;
}

function buildRecentActivity(state: CheckInState, date: string, days = 30) {
	const today = new Date(`${date}T00:00:00`);
	return Array.from({ length: days }, (_, index) => {
		const current = new Date(today);
		current.setDate(today.getDate() - (days - index - 1));
		const key = formatDateToYYYYMMDD(current);
		const plan = getPlanForDate(state, key);
		const tasksTotal = plan.tasks.length;
		const tasksCompleted = plan.tasks.filter((task) => task.completed).length;
		return {
			date: key,
			checkedIn: plan.checkedIn,
			completionRate: tasksTotal ? tasksCompleted / tasksTotal : 0,
		};
	});
}

export function buildDailyOverview(state: CheckInState, date = todayDateString()): DailyOverview {
	const plan = getPlanForDate(state, date);
	const tasksCompleted = plan.tasks.filter((task) => task.completed).length;

	return {
		date,
		checkedIn: plan.checkedIn,
		streak: calculateStreak(state, date),
		monthlyCheckInCount: calculateMonthlyCheckInCount(state, date),
		tasksTotal: plan.tasks.length,
		tasksCompleted,
		nextReminder: getNextReminder(state.reminders),
		recentActivity: buildRecentActivity(state, date),
	};
}

export function getPendingAndCompletedTasks(plan: DailyPlan) {
	return {
		pending: plan.tasks.filter((task) => !task.completed),
		completed: plan.tasks.filter((task) => task.completed),
	};
}

export function shouldTriggerReminder(reminder: ReminderItem, currentDate: string, currentTime: string) {
	return reminder.enabled && reminder.time === currentTime && reminder.lastTriggeredOn !== currentDate;
}
