import { FC } from 'react';

interface PersonProps {
	className?: string;
}

const PersonIcon: FC<PersonProps> = ({ className }) => {
	return (
		<svg
			className={className}
			viewBox="0 0 17 16"
			xmlns="http://www.w3.org/2000/svg"
		>
			<path
				d="M8.5 8C7.4 8 6.45833 7.60833 5.675 6.825C4.89167 6.04167 4.5 5.1 4.5 4C4.5 2.9 4.89167 1.95833 5.675 1.175C6.45833 0.391667 7.4 0 8.5 0C9.6 0 10.5417 0.391667 11.325 1.175C12.1083 1.95833 12.5 2.9 12.5 4C12.5 5.1 12.1083 6.04167 11.325 6.825C10.5417 7.60833 9.6 8 8.5 8ZM0.5 16V13.2C0.5 12.6333 0.646 12.1123 0.938 11.637C1.23 11.1617 1.61733 10.7993 2.1 10.55C3.13333 10.0333 4.18333 9.64567 5.25 9.387C6.31667 9.12833 7.4 8.99933 8.5 9C9.6 9 10.6833 9.12933 11.75 9.388C12.8167 9.64667 13.8667 10.034 14.9 10.55C15.3833 10.8 15.771 11.1627 16.063 11.638C16.355 12.1133 16.5007 12.634 16.5 13.2V16H0.5Z"
				fill="black"
			/>
		</svg>
	);
};

export default PersonIcon;
