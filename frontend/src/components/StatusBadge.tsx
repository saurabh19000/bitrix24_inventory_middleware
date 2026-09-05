interface StatusBadgeProps {
  status: string;
}

const statusStyles: Record<string, string> = {
  PENDING: 'bg-yellow-100 text-yellow-800',
  PROCESSING: 'bg-blue-100 text-blue-800',
  SUCCESS: 'bg-green-100 text-green-800',
  FAILED: 'bg-red-100 text-red-800',
  SKIPPED: 'bg-gray-100 text-gray-600',
  PARTIAL_FAILURE: 'bg-orange-100 text-orange-800',
  COMPLETED: 'bg-green-100 text-green-800',
  COMPLETED_WITH_ERRORS: 'bg-orange-100 text-orange-800',
  CONNECTED: 'bg-green-100 text-green-800',
  UNKNOWN: 'bg-gray-100 text-gray-600',
  DEFAULT: 'bg-gray-100 text-gray-700',
};

export default function StatusBadge({ status }: StatusBadgeProps) {
  const style = statusStyles[status] || statusStyles.DEFAULT;
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${style}`}>
      {status.replace(/_/g, ' ')}
    </span>
  );
}
