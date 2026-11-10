// @ts-check

import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';
import icon from 'astro-icon';
import { defineConfig, fontProviders } from 'astro/config';

// https://astro.build/config
export default defineConfig({
	site: 'https://teluis.com',
	trailingSlash: 'always',
	build: {
		inlineStylesheets: 'always',
	},
	integrations: [
		mdx(),
		sitemap({
			filter: (page) => {
				const url = new URL(page);
				// 数字のみのページネーション一覧URL（例: /2/, /68/ など）をサイトマップから除外
				if (/^\/\d+\/?$/.test(url.pathname)) return false;
				// 404ページを除外
				if (url.pathname.includes('/404')) return false;
				return true;
			},
		}),
		icon(),
	],
	redirects: {
		'/category/マネー・ビジネス/': '/category/ライフスタイル/',
		'/category/暮らし・家電/': '/category/ライフスタイル/',
		'/category/グルメ/': '/category/旅行/',
		'/category/地域ニュース/': '/category/ライフスタイル/',
		'/category/商業施設/': '/category/ライフスタイル/',
		'/category/ブログ運営/': '/category/IT・ガジェット/',
	},
	fonts: [
		{
			provider: fontProviders.local(),
			name: 'Atkinson',
			cssVariable: '--font-atkinson',
			fallbacks: ['sans-serif'],
			options: {
				variants: [
					{
						src: ['./src/assets/fonts/atkinson-regular.woff'],
						weight: 400,
						style: 'normal',
						display: 'swap',
					},
					{
						src: ['./src/assets/fonts/atkinson-bold.woff'],
						weight: 700,
						style: 'normal',
						display: 'swap',
					},
				],
			},
		},
	],
});
