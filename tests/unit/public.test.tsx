// @vitest-environment jsdom
import React from 'react';
import {it,expect,afterEach} from 'vitest';
import {render,screen,cleanup,fireEvent} from '@testing-library/react';
import PublicSite from '../../src/components/PublicSite';
afterEach(()=>{cleanup();location.hash='';});
it('unauthenticated private route shows login without exposing seeded business records',()=>{location.hash='Invoices';render(<PublicSite/>);expect(screen.getByRole('heading',{name:'Welcome back.'})).toBeTruthy();expect(screen.queryByText('Aarav Energy · Demo')).toBeNull();});
it('landing presents real workflow and negotiated fees without fake performance claims',()=>{location.hash='home';render(<PublicSite/>);expect(screen.getAllByText('Contact for pricing')).toHaveLength(3);expect(screen.getByRole('link',{name:'Create your account'})).toBeTruthy();expect(screen.queryByText('Aarav Energy · Demo')).toBeNull();});

it('unconfigured local login offers explicit demo entry without collecting credentials',async()=>{location.hash='login';render(<PublicSite/>);expect(screen.queryByLabelText('Password')).toBeNull();expect(screen.queryByLabelText('Email address')).toBeNull();fireEvent.click(screen.getByRole('button',{name:'Open demo workspace'}));expect(location.hash).toBe('#Dashboard');expect(await screen.findByRole('heading',{name:'Your sales, in focus'})).toBeTruthy();});
